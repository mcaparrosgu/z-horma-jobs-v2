#!/usr/bin/env python3
"""Trae ofertas de una fuente del registro endpoints.json y las deja en datos/ofertas/raw/.

Uso:
    python -I ingestar.py <fuente> [--limite N] [--endpoints RUTA] [--salida DIR] [--dry-run]

- Solo trabaja con fuentes que estén en endpoints.json y con activa = true.
- La clave de acceso se lee de la variable de entorno que indica `clave_env` (siempre
  `FUENTE_*`); nunca se imprime ni se escribe en disco.
- Cada oferta se guarda como <fuente>-<id>-<hash>.md con la fuente, la URL y la fecha de
  descarga arriba. El texto de la oferta es NO FIABLE: se guarda tal cual, como dato.
- Fuentes con `adaptador` (hoy `boe-sumario` y `feinaactiva-xml`): el origen no trae ofertas sino un documento anidado
  por día (BOE) o un XML (Feina Activa); el adaptador (en este archivo, solo los nombres de `ADAPTADORES`) lo pasa a
  lista plana y, en el BOE, `url` lleva `{fecha}`.
  Del BOE solo la sección II.B y solo las resoluciones que convocan plazas (nada de listas de aspirantes: llevan nombres).
  Feina Activa: XML de hasta 10 MB, solo UTF-8, sin DTD ni entidades, solo ofertas PUBLISHED con enlace de su dominio; no copia `disability`.
- La licencia de origen (`licencia`, `atribucion`) la declara la fuente en endpoints.json y el script la
  escribe en la cabecera de cada raw; sin licencia válida no ingesta nada.
- Con --dry-run no hace ninguna llamada de red: muestra qué haría.
- Seguridad de la descarga (SSRF): solo https al puerto 443, sin usuario en la URL y con
  nombre de dominio con punto; el nombre se resuelve y TODAS sus IP deben ser públicas, y
  la conexión va a la IP comprobada (un DNS que cambie de respuesta no sirve de truco). Las
  redirecciones solo pueden ir al mismo host y puerto. Sin proxies. Límite de 5 MB y de
  30 s de lectura. Los errores salen como código fijo, nunca como mensaje de red.
- `--salida` debe estar dentro de `datos/ofertas/` del repositorio. `--endpoints` con un archivo
  de fuera del repositorio solo se acepta con --dry-run.
- Cualquier fallo inesperado sale como `ERROR_INTERNO` más el nombre del tipo de error, sin
  traceback (un traceback podría llevar la clave).
Solo biblioteca estándar.
"""
import argparse
import datetime
import hashlib
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
import sys
import time
import unicodedata
import xml.etree.ElementTree as ElementTree
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ENDPOINTS = AQUI.parent / "endpoints.json"
RAIZ = AQUI.parents[3]  # scripts → fuentes-ofertas → skills → .claude → repo
SALIDA_PERMITIDA = RAIZ / "datos" / "ofertas"
MAX_BYTES = 5_000_000
MAX_SEGUNDOS = 30  # reloj total de la descarga; cada lectura suelta tiene además su propio tope de 20 s
PROHIBIDAS = {"linkedin.com", "indeed.com"}  # por regla del producto, no por calificación
LICENCIAS = ("empresa", "socio", "abierto", "usuaria")  # mismas que oferta.origen.licencia
MAX_ATRIBUCION = 200
CLAVE_ENV = re.compile(r"FUENTE_[A-Z0-9_]+")
# Túneles IPv6 que llevan una IPv4 dentro: NAT64 y compatibles, 6to4 (2002::/16) y Teredo (2001::/32). Una IP de estos rangos
# puede esconder 127.0.0.1 o la red interna; se rechazan con nombre y no dependen de lo que opine cada versión de Python.
RECHAZADAS = [ipaddress.ip_network(r) for r in ("64:ff9b::/96", "64:ff9b:1::/48", "::/96", "::ffff:0:0:0/96", "2002::/16", "2001::/32")]
CLAVE_VALOR = re.compile(r"[!-~]+")  # ASCII visible: sin espacios, saltos de línea ni control
FECHA = re.compile(r"\d{4}-\d{2}-\d{2}([T ][0-9:.+\-Z]{0,20})?")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
TELEFONO = re.compile(r"(?<![\w.])\+?\d[\d ().\-/]{5,}\d(?![\w])")  # 7 o más cifras con separadores
FECHA_SUELTA = re.compile(r"\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}")
# Cada clave solo viaja a su servidor: nombre de la variable → dominio al que se puede mandar. Está en el código (pasa por
# git y revisión) y no en endpoints.json, que se edita a la ligera: así cambiar la `url` de una fuente no desvía su clave.
# JobTech no usa clave. Al calificar una fuente con clave, se añade aquí, p. ej. "FUENTE_ADZUNA": "api.adzuna.com".
HOST_DE_CLAVE: dict[str, str] = {}
NOMBRE_CABECERA = re.compile(r"[A-Za-z0-9_-]{1,64}")  # sirve para cabecera y parámetro; sin espacios ni saltos de línea


class ErrorFuente(Exception):
    """Fallo de descarga con un código fijo (sin texto de red, que podría llevar datos)."""

    def __init__(self, codigo: str):
        super().__init__(codigo)
        self.codigo = codigo


def es_publica(ip: str) -> bool:
    """True solo para direcciones de internet públicas (no locales, privadas, enlace local, etc.)."""
    try:
        dir_ = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if isinstance(dir_, ipaddress.IPv6Address) and dir_.ipv4_mapped:
        dir_ = dir_.ipv4_mapped
    if dir_.is_multicast or any(dir_.version == n.version and dir_ in n for n in RECHAZADAS):
        return False
    return dir_.is_global


def validar_url(url: str) -> str:
    """Comprobaciones sin red. Devuelve el host; lanza ErrorFuente('URL_NO_VALIDA') si algo falla."""
    try:
        p = urllib.parse.urlparse(url)
        puerto = p.port
    except ValueError:
        raise ErrorFuente("URL_NO_VALIDA")
    host = (p.hostname or "").lower().rstrip(".")  # «linkedin.com.» es el mismo sitio que «linkedin.com»
    if (p.scheme != "https" or "@" in p.netloc or puerto not in (None, 443)
            or "." not in host or ".." in host or host.startswith(".")):
        raise ErrorFuente("URL_NO_VALIDA")
    return host


class ConexionSegura(http.client.HTTPSConnection):
    """Resuelve el nombre, exige IP públicas y se conecta a la IP ya comprobada."""

    def connect(self):
        try:
            infos = socket.getaddrinfo(self.host, self.port or 443, type=socket.SOCK_STREAM)
        except (OSError, UnicodeError):  # UnicodeError: nombres con etiquetas vacías o larguísimas
            raise ErrorFuente("RED")
        ips = [i[4][0] for i in infos]
        if not ips or not all(es_publica(ip) for ip in ips):
            raise ErrorFuente("DESTINO_NO_PUBLICO")
        for ip in dict.fromkeys(ips):
            try:
                sock = socket.create_connection((ip, self.port or 443), self.timeout)
            except OSError:
                continue
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
            return
        raise ErrorFuente("RED")


class ManejadorSeguro(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(ConexionSegura, req, context=ssl.create_default_context())


class SoloMismoHostYPuerto(urllib.request.HTTPRedirectHandler):
    """Solo sigue redirecciones https al mismo host y puerto (evita SSRF y la fuga de la clave)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        try:
            actual = validar_url(req.full_url)
            nuevo_host = validar_url(newurl)
            a, b = urllib.parse.urlparse(req.full_url), urllib.parse.urlparse(newurl)
        except ErrorFuente:
            raise ErrorFuente("REDIRECCION_RECHAZADA")
        if nuevo_host != actual or (b.port or 443) != (a.port or 443):
            raise ErrorFuente("REDIRECCION_RECHAZADA")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def abrir(req, plazo: float, tope: int | None = None) -> bytes:
    """Descarga con tope de tamaño (MAX_BYTES salvo que el formato fije otro) y de tiempo total (se mira entre
    recepciones, de modo que el máximo real es MAX_SEGUNDOS más una espera de socket de 20 s). Sin proxies."""
    tope = MAX_BYTES if tope is None else tope
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), ManejadorSeguro, SoloMismoHostYPuerto)
    try:
        with opener.open(req, timeout=20) as r:
            trozos, total = [], 0
            while True:
                if time.monotonic() > plazo:
                    raise ErrorFuente("TIEMPO")
                t = r.read1(65536)  # vuelve tras UNA recepción: así el reloj se mira entre trozos
                if not t:
                    return b"".join(trozos)
                total += len(t)
                if total > tope:
                    raise ErrorFuente("TAMANO")
                trozos.append(t)
    except ErrorFuente:
        raise
    except TimeoutError:
        raise ErrorFuente("TIEMPO")
    except urllib.error.HTTPError as e:
        e.close()  # sin leer ni devolver el cuerpo: solo el código
        raise ErrorFuente("NO_ENCONTRADO" if e.code == 404 else "RED")  # 404: p. ej. el BOE no publica los domingos
    except Exception:  # URLError, HTTPError, TLS, ValueError de cabeceras (su texto podría llevar la clave)...
        raise ErrorFuente("RED")


def ruta(obj, camino: str):
    """Lee a.b.0.c dentro de dicts y listas; devuelve None si no existe."""
    for parte in camino.split(".") if camino else []:
        if isinstance(obj, list) and parte.isdigit() and int(parte) < len(obj):
            obj = obj[int(parte)]
        elif isinstance(obj, dict) and parte in obj:
            obj = obj[parte]
        else:
            return None
    return obj


def host_autorizado(clave_env: str, host: str) -> bool:
    """La clave solo se manda al dominio que tiene asignado en HOST_DE_CLAVE (o a un subdominio suyo)."""
    dominio = HOST_DE_CLAVE.get(clave_env)
    return bool(dominio) and (host == dominio or host.endswith("." + dominio))


def limpio(x) -> str:
    s = re.sub(r"[^A-Za-z0-9_.-]", "_", str(x)).lstrip(".")[:80]
    return s or "sin_id"


def sin_contacto(texto) -> str:
    """Quita emails y teléfonos del texto de la oferta: son datos de terceros y no se guardan."""
    t = EMAIL.sub("[contacto omitido]", str(texto or ""))
    def quitar(m):
        # 7 o más cifras y no es una fecha (2026-11-06, 06.11.2026)
        es_tel = sum(c.isdigit() for c in m.group()) >= 7 and not FECHA_SUELTA.fullmatch(m.group())
        return "[contacto omitido]" if es_tel else m.group()
    return TELEFONO.sub(quitar, t)


def nombre_archivo(fuente: str, id_) -> str:
    """El hash evita que dos ids distintos («a/b» y «a_b») acaben en el mismo archivo."""
    h = hashlib.sha256(str(id_).encode("utf-8")).hexdigest()[:8]
    return f"{limpio(fuente)}-{limpio(id_)[:60]}-{h}.md"


def pendientes(nombres: list[str], procesadas: Path) -> list[str]:
    """Archivos de raw/ que aún no tienen su procesada (mismo nombre, con .json): solo esos necesitan agentes."""
    return [n for n in nombres if not (procesadas / (Path(n).stem + ".json")).is_file()]


# --- Adaptador del BOE (sumario diario, solo sección II.B «Oposiciones y concursos») -----------------------------------
# El BOE no publica «ofertas» sino resoluciones. Solo se queda con las que CONVOCAN plazas y se descartan las listas de
# aspirantes, admitidos o aprobados (llevan nombres de personas), las correcciones, las modificaciones, las plazas
# declaradas desiertas y las ofertas de empleo globales. Solo se usa el sumario: NO se descarga el texto de cada
# resolución (robots.txt del BOE pide no hacerlo); la oferta enlaza a la original. Licencia: aviso legal del BOE.
BOE_SECCION = "2B"
BOE_ID = re.compile(r"BOE-[A-Z]-[0-9]{4}-[0-9]{1,7}")  # [0-9], no \d: \d acepta cifras de otros alfabetos
BOE_FECHA = re.compile(r"[0-9]{8}")
BOE_SI = re.compile(r"\bse convocan?\b|\breferente a la convocatoria\b")
# Lista de exclusión: palabras que delatan listas con nombres de personas, tribunales y comisiones, o que no son una
# convocatoria. Ante la duda se descarta (cuesta una oferta; dejar pasar un nombre cuesta un dato personal).
BOE_NO = re.compile(
    r"relacion|\blist(?:a|as|ado|ados)\b|aspirantes|opositor|candidat|participante|interesad|aprobad|admitid|excluid|"
    r"superado|seleccionad|resultado|calificacion|adjudic|nombra|\bse designan?\b|comision|composicion|miembros|jurado|"
    r"correccion|corrigen|se modifica|desiert|oferta de empleo|tribunal|resuelve|anula|sin efecto")
BOE_PERSONA = re.compile(r"\b(?:don|dona|d\.|da\.|dna\.|sr\.|sra\.)\s")  # tratamientos personales: nunca en una convocatoria
BOE_MAX_TITULO = 400  # las convocatorias reales son cortas; un título enorme es sospechoso (y alimenta a los agentes)
AVISO_LIBRE_DESIGNACION = ("Aviso de Horma: las convocatorias de libre designación suelen estar reservadas a personal funcionario; "
                           "comprueba las bases en el BOE antes de preparar nada.")
BOE_ORGANISMO = re.compile(r"^Resoluci[oó]n de [^,]+, (?:de la|del|de) (.{3,150}?), (?:referente|por la que|de correcci)")
BOE_PROPIOS = ("ADMINISTRACION LOCAL", "UNIVERSIDADES")  # departamentos genéricos: el organismo real va en el título


def _sin_acentos(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", t.lower()) if not unicodedata.combining(c))


def _lista(x) -> list:
    """El JSON del BOE trae un solo elemento como objeto y varios como lista."""
    return [e for e in x if isinstance(e, dict)] if isinstance(x, list) else ([x] if isinstance(x, dict) else [])


def es_convocatoria(titulo: str) -> bool:
    t = _sin_acentos(titulo)
    return (len(titulo) <= BOE_MAX_TITULO and bool(BOE_SI.search(t))
            and not BOE_NO.search(t) and not BOE_PERSONA.search(t))


def _una_linea(texto, tope: int = 300) -> str:
    """Texto del origen en una sola línea y con tope: sin saltos que simulen una cabecera ni textos largos para los agentes."""
    return " ".join(str(texto or "").split())[:tope]


def adaptar_boe(datos) -> tuple[list[dict], int]:
    """Del sumario del BOE a una lista plana de ofertas {id, titulo, empresa, url, descripcion, fecha}.
    Devuelve (convocatorias, descartadas). Lanza ErrorFuente('FORMATO') si el sumario no tiene la forma esperada."""
    sumario = ruta(datos, "data.sumario")
    fecha_raw = ruta(sumario, "metadatos.fecha_publicacion") if isinstance(sumario, dict) else None
    if not isinstance(fecha_raw, str) or not BOE_FECHA.fullmatch(fecha_raw):
        raise ErrorFuente("FORMATO")
    fecha = f"{fecha_raw[:4]}-{fecha_raw[4:6]}-{fecha_raw[6:]}"
    validas, descartadas = [], 0
    for diario in _lista(sumario.get("diario")):
        n = diario.get("numero")
        numero = n if isinstance(n, str) and n.isascii() and n.isdigit() and len(n) <= 6 else "?"
        for sec in _lista(diario.get("seccion")):
            if sec.get("codigo") != BOE_SECCION:
                continue
            for dep in _lista(sec.get("departamento")):
                nombre_dep = _una_linea(dep.get("nombre")) if isinstance(dep.get("nombre"), str) else ""
                for ep in _lista(dep.get("epigrafe")):
                    nombre_ep = _una_linea(ep.get("nombre")) if isinstance(ep.get("nombre"), str) else ""
                    for it in _lista(ep.get("item")):
                        ident, titulo = it.get("identificador"), it.get("titulo")
                        if not (isinstance(ident, str) and BOE_ID.fullmatch(ident) and isinstance(titulo, str) and titulo.strip()):
                            descartadas += 1
                            continue
                        if not es_convocatoria(titulo):
                            descartadas += 1
                            continue
                        titulo = _una_linea(titulo, BOE_MAX_TITULO)
                        organismo = nombre_dep
                        m = BOE_ORGANISMO.match(titulo)
                        if m and _sin_acentos(nombre_dep).upper().strip() in BOE_PROPIOS:
                            organismo = _una_linea(m.group(1))
                        aviso = f"\n{AVISO_LIBRE_DESIGNACION}" if "libre designacion" in _sin_acentos(titulo) else ""
                        validas.append({
                            "id": ident, "titulo": titulo, "empresa": organismo, "fecha": fecha,
                            "url": f"https://www.boe.es/diario_boe/txt.php?id={ident}",
                            # Sin el identificador en el texto: «BOE-A-2026-23304» parece un teléfono al filtro de contactos
                            # (ya va en la URL). Y sin repetir el título, que es el encabezado del raw.
                            "descripcion": (f"Organismo: {organismo}\nBOE sección II.B (oposiciones y concursos) · epígrafe: {nombre_ep}\n"
                                            f"BOE núm. {numero} de {fecha}\n"
                                            "El texto completo de la convocatoria está en el enlace; Horma no lo descarga." + aviso),
                        })
    return validas, descartadas


# --- Adaptador de Feina Activa (SOC, Generalitat de Catalunya; XML de datos abiertos) ----------------------------------
# Un único XML con todas las ofertas vivas (~7 MB). Licencia «oberta d'ús d'informació - Catalunya»: no se altera el
# contenido, se cita la fuente y la fecha de actualización. Se queda con lo que describe el puesto; NO copia `disability`
# (dato de la oferta que nunca debe servir para inferir nada de una candidata, RGPD art. 9), ni `postcode`, ni `origin`.
MAX_BYTES_XML = 10_000_000  # tope propio de este formato; vive en el código, no en endpoints.json
FA_URL = "https://feinaactiva.gencat.cat/search/offers/detail/"
FA_ID = re.compile(r"[A-Za-z0-9_-]{1,40}")
FA_FECHA = re.compile(r"([0-9]{2})/([0-9]{2})/([0-9]{4})")
XML_PELIGROSO = re.compile(rb"<!\s*(?:DOCTYPE|ENTITY)", re.IGNORECASE)  # sin DTD ni entidades: ataques de expansión
XML_CODIFICACION = re.compile(rb"<\?xml[^>]{0,200}?encoding\s*=\s*[\"']\s*(?!utf-8[\"'])", re.IGNORECASE)  # solo UTF-8
FA_MAX_ETIQUETAS = 600_000  # el feed real tiene ~200.000 «<»; 10 MB de «<a/>» serían millones de nodos en memoria
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f\x85  ]")  # incluye los saltos de línea Unicode
FA_MAX_DESCRIPCION = 6000


def _texto_xml(el, tag: str) -> str:
    hijo = el.find(tag)
    return CONTROL.sub("", hijo.text or "").strip() if hijo is not None else ""


def adaptar_feinaactiva(crudo: bytes) -> tuple[list[dict], int]:
    """Del XML de Feina Activa a una lista plana de ofertas {id, titulo, empresa, url, descripcion, fecha}.
    Devuelve (ofertas, descartadas). Lanza ErrorFuente('FORMATO') si no es el XML esperado."""
    if not isinstance(crudo, bytes) or b"\x00" in crudo or XML_CODIFICACION.search(crudo[:400]):
        raise ErrorFuente("FORMATO")
    try:
        crudo.decode("utf-8")  # en UTF-16 u otra codificación, la regex de bytes no vería el DTD
    except UnicodeDecodeError:
        raise ErrorFuente("FORMATO")
    if XML_PELIGROSO.search(crudo) or crudo.count(b"<") > FA_MAX_ETIQUETAS:
        raise ErrorFuente("FORMATO")
    try:
        raiz = ElementTree.fromstring(crudo)
    except (ElementTree.ParseError, ValueError, RecursionError):
        raise ErrorFuente("FORMATO")
    if raiz.tag != "ofertes":
        raise ErrorFuente("FORMATO")
    validas, descartadas = [], 0
    for ad in raiz.iter("ad"):
        ident, titulo, enlace = _texto_xml(ad, "id"), _una_linea(_texto_xml(ad, "title"), 400), _texto_xml(ad, "url")
        if (not FA_ID.fullmatch(ident) or not titulo or _texto_xml(ad, "status") != "PUBLISHED"
                or not (enlace.startswith(FA_URL) and enlace[len(FA_URL):] == ident)):
            descartadas += 1
            continue
        m = FA_FECHA.fullmatch(_texto_xml(ad, "date"))
        try:  # la forma válida no basta: 31/02/2026 no existe
            fecha = datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat() if m else None
        except ValueError:
            fecha = None
        sal_min, sal_max = _texto_xml(ad, "salaryMin"), _texto_xml(ad, "salaryMax")
        salario = " a ".join(s for s in (sal_min, sal_max) if s and s != "0")
        lugar = ", ".join(s for s in (_una_linea(_texto_xml(ad, "city"), 80), _una_linea(_texto_xml(ad, "region"), 80)) if s)
        lineas = [("Funciones", _texto_xml(ad, "content")), ("Experiencia y competencias", _texto_xml(ad, "experience")),
                  ("Requisitos", _texto_xml(ad, "requirements")), ("Estudios", _texto_xml(ad, "studies")),
                  ("Contrato", _texto_xml(ad, "contract")), ("Jornada", _texto_xml(ad, "workingHours")),
                  ("Salario bruto (€)", salario), ("Lugar", lugar)]
        desc = "\n".join(f"{k}: {v}" for k, v in lineas if v)[:FA_MAX_DESCRIPCION]
        validas.append({"id": ident, "titulo": titulo, "empresa": _una_linea(_texto_xml(ad, "company"), 200) or "no indicada en la fuente",
                        "url": enlace, "descripcion": desc, "fecha": fecha})
    return validas, descartadas


ADAPTADORES = {"boe-sumario": adaptar_boe, "feinaactiva-xml": adaptar_feinaactiva}
ADAPTADORES_XML = {"feinaactiva-xml"}  # reciben los bytes tal cual; el resto reciben el JSON ya leído


def origen_de(fuente: dict):
    """(licencia, atribucion) de la fuente, o None si falta o no es válida. Lo fija el registro, nunca la oferta."""
    lic, atr = fuente.get("licencia"), fuente.get("atribucion")
    if lic not in LICENCIAS or not (atr is None or (isinstance(atr, str) and len(atr) <= MAX_ATRIBUCION and "PENDIENTE" not in atr)):
        return None
    return lic, atr


def fallo(fuente: str, codigo: str) -> int:
    print(json.dumps({"fuente": fuente, "error": codigo}), file=sys.stderr)
    return 2


def main() -> int:
    # En Windows la consola usa cp1252: se fuerza UTF-8 para tildes y eñes.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("fuente")
    ap.add_argument("--limite", type=lambda s: max(1, int(s)), default=50)  # un límite negativo cortaría por el final
    ap.add_argument("--endpoints", type=Path, default=ENDPOINTS)
    ap.add_argument("--salida", type=Path, default=SALIDA_PERMITIDA / "raw")
    ap.add_argument("--fecha", help="AAAA-MM-DD; solo para fuentes por día (adaptador): por defecto hoy, o el sábado si hoy es domingo")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    salida = a.salida.resolve()
    if not salida.is_relative_to(SALIDA_PERMITIDA.resolve()):
        print("`--salida` debe estar dentro de datos/ofertas/ del repositorio.", file=sys.stderr)
        return 2
    if not a.dry_run and not a.endpoints.resolve().is_relative_to(RAIZ.resolve()):
        print("`--endpoints` fuera del repositorio solo se acepta con --dry-run.", file=sys.stderr)
        return 2
    registro = json.loads(a.endpoints.read_text(encoding="utf-8"))
    nombres = [f["nombre"] for f in registro["fuentes"]]
    if len(nombres) != len(set(nombres)):
        print("endpoints.json tiene dos fuentes con el mismo nombre.", file=sys.stderr)
        return 2
    fuente = next((f for f in registro["fuentes"] if f["nombre"] == a.fuente), None)
    if fuente is None:
        print(f"Fuente «{a.fuente}» no está en endpoints.json. Califícala antes con /calificar-fuentes.", file=sys.stderr)
        return 2
    if not fuente["activa"]:
        print(f"Fuente «{a.fuente}» está desactivada (activa = false).", file=sys.stderr)
        return 2
    origen = origen_de(fuente)
    if origen is None:
        print(f"Fuente «{a.fuente}» sin `licencia` válida (empresa, socio, abierto o usuaria) o con `atribucion` no válida en endpoints.json.", file=sys.stderr)
        return 2
    adaptador = fuente.get("adaptador")
    if adaptador is not None and adaptador not in ADAPTADORES:
        print(f"Fuente «{a.fuente}» con adaptador desconocido (los permitidos están en ADAPTADORES de ingestar.py).", file=sys.stderr)
        return 2
    if adaptador is None and "{" in fuente["url"]:
        return fallo(a.fuente, "URL_NO_VALIDA")  # la plantilla {fecha} solo la entiende un adaptador
    try:
        host = validar_url(fuente["url"])
    except ErrorFuente as e:
        return fallo(a.fuente, e.codigo)
    if any(host == d or host.endswith("." + d) for d in PROHIBIDAS) or "indeed." in host:
        print("LinkedIn e Indeed no son fuente de ofertas (regla del producto).", file=sys.stderr)
        return 2

    params, cabeceras = dict(fuente["parametros"]), dict(fuente["cabeceras"])
    for prohibida in [k for k in cabeceras if k.lower() in ("host", "content-length")]:
        del cabeceras[prohibida]  # el Host lo fija la conexión comprobada, no la fuente
    cabeceras.setdefault("User-Agent", "Horma/0.1 (+ingesta de ofertas)")
    if fuente.get("clave_env"):
        if not CLAVE_ENV.fullmatch(fuente["clave_env"]):
            print("`clave_env` debe llamarse FUENTE_ seguido de mayúsculas, números o _.", file=sys.stderr)
            return 2
        if not host_autorizado(fuente["clave_env"], host):
            print(f"La clave {fuente['clave_env']} no está autorizada para este servidor (HOST_DE_CLAVE en ingestar.py).", file=sys.stderr)
            return 2
        por_parametro = fuente.get("clave_en") == "parametro"
        nombre = fuente.get("clave_nombre") or (None if por_parametro else "Authorization")
        if not nombre or not NOMBRE_CABECERA.fullmatch(nombre):
            print("`clave_nombre` falta o no es válido (letras, números, guion y guion bajo; obligatorio si la clave va por parámetro).", file=sys.stderr)
            return 2
        clave = (os.environ.get(fuente["clave_env"]) or "").strip()
        if not clave:
            print(f"Falta la variable de entorno {fuente['clave_env']}.", file=sys.stderr)
            return 2
        if not CLAVE_VALOR.fullmatch(clave):
            print(f"El valor de {fuente['clave_env']} tiene caracteres no válidos (espacios o saltos de línea dentro).", file=sys.stderr)
            return 2
        (params if por_parametro else cabeceras)[nombre] = clave
    url_base = fuente["url"]
    if adaptador is not None and "{fecha}" in url_base:
        try:
            if a.fecha and not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", a.fecha):
                raise ValueError
            dia = datetime.date.fromisoformat(a.fecha) if a.fecha else datetime.date.today()
        except ValueError:
            print("`--fecha` debe ser AAAA-MM-DD.", file=sys.stderr)
            return 2
        if not a.fecha and dia.weekday() == 6:  # domingo: el BOE no publica
            dia -= datetime.timedelta(days=1)
        if dia > datetime.date.today():
            print("`--fecha` no puede ser futura.", file=sys.stderr)
            return 2
        url_base = url_base.replace("{fecha}", dia.strftime("%Y%m%d"))
        try:  # la URL final debe seguir yendo al mismo servidor que se comprobó con la plantilla
            if validar_url(url_base) != host:
                raise ErrorFuente("URL_NO_VALIDA")
        except ErrorFuente as e:
            return fallo(a.fuente, e.codigo)
    url = url_base + ("?" + urllib.parse.urlencode(params) if params else "")

    if a.dry_run:
        print(f"[dry-run] GET {fuente['url']} (parámetros: {sorted(params)}), límite {a.limite}, salida {a.salida}")
        return 0

    req = urllib.request.Request(url, headers=cabeceras, method="GET")
    try:
        es_xml = adaptador in ADAPTADORES_XML
        crudo = abrir(req, time.monotonic() + MAX_SEGUNDOS, *([MAX_BYTES_XML] if es_xml else []))
        try:
            datos = crudo if es_xml else json.loads(crudo.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
            raise ErrorFuente("FORMATO")
    except ErrorFuente as e:
        return fallo(a.fuente, e.codigo)
    descartadas = None
    if adaptador is not None:
        try:
            datos, descartadas = ADAPTADORES[adaptador](datos)  # a una lista plana con las claves del mapeo_campos
        except ErrorFuente as e:
            return fallo(a.fuente, e.codigo)
    m = fuente["mapeo_campos"]
    lista = ruta(datos, m["lista"])
    if not isinstance(lista, list):
        return fallo(a.fuente, "FORMATO")
    salida.mkdir(parents=True, exist_ok=True)
    hoy = datetime.date.today().isoformat()
    guardadas = 0
    nombres: list[str] = []
    for item in lista[: a.limite]:
        if not isinstance(item, dict):
            continue
        id_ = ruta(item, m["id"])
        if id_ is None:
            continue
        titulo, empresa = ruta(item, m["titulo"]), ruta(item, m["empresa"])
        enlace, desc = ruta(item, m["url"]), ruta(item, m["descripcion"])
        fecha = ruta(item, m["fecha"]) if "fecha" in m else None
        # Lo que el origen cuenta de sí mismo no es de fiar: solo https y fechas con forma de fecha.
        enlace = enlace if isinstance(enlace, str) and enlace.startswith("https://") else None
        fecha = fecha if isinstance(fecha, str) and FECHA.fullmatch(fecha) else None
        # Cabecera con json.dumps: una línea por campo; el texto de la oferta no puede falsearla.
        cab = {"fuente": fuente["nombre"], "url": enlace, "fecha_descarga": hoy, "fecha_publicacion": fecha,
               "licencia": origen[0], "atribucion": origen[1]}
        cabecera = "".join(f"{k}: {json.dumps(v, ensure_ascii=False)}\n" for k, v in cab.items())
        titulo, empresa, desc = sin_contacto(titulo), sin_contacto(empresa), sin_contacto(desc)
        # Tope de longitud: una fuente hostil no puede encarecer los agentes con un título gigante.
        titulo, empresa = _una_linea(titulo, 400), _una_linea(empresa, 200)
        cuerpo = f"---\n{cabecera}---\n\n# {titulo}\n\nEmpresa: {empresa}\n\n{desc}\n"
        nombre = nombre_archivo(fuente["nombre"], id_)
        (salida / nombre).write_text(cuerpo, encoding="utf-8")
        nombres.append(nombre)
        guardadas += 1
    # «pendientes»: las que no tienen procesada; /ingestar-ofertas solo gasta agentes en esas.
    resumen = {"fuente": fuente["nombre"], "guardadas": guardadas, "fecha": hoy,
               "pendientes": pendientes(nombres, salida.parent / "procesadas")}
    if descartadas is not None:
        resumen["descartadas"] = descartadas  # elementos del origen que no son convocatorias
    print(json.dumps(resumen))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # solo el nombre del tipo: ni mensaje ni traceback
        print(json.dumps({"error": "ERROR_INTERNO", "tipo": type(e).__name__}), file=sys.stderr)
        sys.exit(2)
