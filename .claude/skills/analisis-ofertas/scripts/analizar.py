#!/usr/bin/env python3
"""Análisis de ofertas en código, sin LLM (indicación del profesor, 10-nov-2026).

Sustituye a los agentes `clasificador-oferta` y `matcher`. Las reglas viven en ../reglas.json
(un archivo que se amplía a mano). Solo biblioteca estándar.

Uso:
    python -I analizar.py clasificar --ofertas DIR [--todas]
    python -I analizar.py puntuar --perfil P.json --preferencias PR.json --ofertas DIR \
        --orden orden.json --salida match.json [--rango 60-100] [--fecha AAAA-MM-DD]

clasificar: pone `taxonomia` (sector, familia, stack) con la taxonomía común. Por defecto solo toca
  las ofertas sin clasificar; --todas las rehace. No toca `nivel` (lo fija el extractor, solo si la
  oferta lo dice). Si no hay evidencia clara: null; nunca se inventa una categoría.
puntuar: `nota` (solo experiencia y formación frente a los requisitos), `nivel_condiciones` (solo
  condiciones de trabajo) y `explicacion` con plantilla. Nunca lee `avisos` ni rasgos personales.
"""
import argparse
import datetime
import json
import re
import sys
import unicodedata
from pathlib import Path

REGLAS = json.loads((Path(__file__).resolve().parent.parent / "reglas.json").read_text(encoding="utf-8"))


def norm(x) -> str:
    t = unicodedata.normalize("NFKD", str(x))
    return "".join(c for c in t if not unicodedata.combining(c)).strip().lower()


def en_lista(valor, lista) -> bool:
    return norm(valor) in {norm(v) for v in (lista or [])}


# ───────────────────────── clasificar ─────────────────────────

def _patron(palabra: str) -> re.Pattern:
    p = norm(palabra)
    estrella = p.endswith("*")
    p = re.escape(p.rstrip("*"))
    return re.compile(r"(?<![a-z0-9])" + p + (r"[a-z]*" if estrella else r"(?![a-z0-9])"))


_FAMILIAS = {f: (d["sector"], [_patron(w) for w in d["palabras"]]) for f, d in REGLAS["familias"].items()}


def _tec_patron(t: str) -> re.Pattern:
    base = re.escape(t)
    flags = 0 if len(t) <= 3 else re.IGNORECASE  # siglas cortas (SQL, AWS, Go): se exige tal cual
    return re.compile(r"(?<![A-Za-z0-9])" + base + r"(?![A-Za-z0-9])", flags)


_SECTOR_PALABRAS = {s: [_patron(w) for w in ws] for s, ws in REGLAS.get("sector_palabras", {}).items()}
_TECNOLOGIAS = [(t, _tec_patron(t)) for t in REGLAS["tecnologias"]]
_PROHIBIDAS = [re.compile(p) for p in REGLAS["prohibidas"]]


def es_prohibido(texto: str) -> bool:
    """Un requisito que habla de edad, género, nacionalidad, salud, etc. se ignora y no se cita."""
    t = norm(texto)
    return any(p.search(t) for p in _PROHIBIDAS)


def _textos(o: dict) -> tuple:
    titulo = norm(o.get("titulo", ""))
    cuerpo = norm(" ".join([x for x in o.get("requisitos", []) if not es_prohibido(x)] + [o.get("descripcion", "")]))
    return titulo, cuerpo


def stack_de(o: dict) -> list:
    """Tecnologías que el texto nombra expresamente, con su escritura de la lista."""
    crudo = " ".join([o.get("titulo", "")] + [x for x in o.get("requisitos", []) if not es_prohibido(x)] + [o.get("descripcion", "")])
    return [t for t, p in _TECNOLOGIAS if p.search(crudo)]


def clasificar(o: dict) -> dict:
    titulo, cuerpo = _textos(o)
    umbral = REGLAS["umbral_puntos"]
    puntos = {}
    for fam, (sector, pats) in _FAMILIAS.items():
        s = 0
        for p in pats:
            if p.search(titulo):
                s += 3
            elif p.search(cuerpo):
                s += 1
        if s:
            puntos[fam] = s
    sector = familia = None
    orden = sorted(puntos.items(), key=lambda kv: -kv[1])
    if orden and orden[0][1] >= umbral and (len(orden) == 1 or orden[0][1] > orden[1][1]):
        familia = orden[0][0]
        sector = _FAMILIAS[familia][0]
    else:  # sin familia clara: ¿hay un sector claro?
        por_sector = {}
        for fam, s in puntos.items():
            por_sector[_FAMILIAS[fam][0]] = por_sector.get(_FAMILIAS[fam][0], 0) + s
        for sec, pats in _SECTOR_PALABRAS.items():  # palabras que indican el sector pero no una familia concreta
            for p in pats:
                if p.search(titulo):
                    por_sector[sec] = por_sector.get(sec, 0) + 3
                elif p.search(cuerpo):
                    por_sector[sec] = por_sector.get(sec, 0) + 1
        so = sorted(por_sector.items(), key=lambda kv: -kv[1])
        if so and so[0][1] >= umbral and (len(so) == 1 or so[0][1] > so[1][1]):
            sector = so[0][0]
    return {"sector": sector, "familia": familia, "stack": stack_de(o)}


def leer_ofertas(carpeta: Path):
    """Pares (archivo, oferta) de la carpeta. Se saltan los .json que no son una oferta (sin `id` y `titulo`,
    p. ej. un match.json guardado ahí) y se avisa por stderr, en vez de fallar o escribir en ellos."""
    salida, saltados = [], []
    for f in sorted(carpeta.glob("*.json")):
        try:
            o = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            o = None
        if isinstance(o, dict) and isinstance(o.get("id"), str) and "titulo" in o:
            salida.append((f, o))
        else:
            saltados.append(f.name)
    if saltados:
        print(f"aviso: {len(saltados)} archivo(s) que no son ofertas, saltados: {', '.join(saltados)}", file=sys.stderr)
    return salida


def cmd_clasificar(a) -> int:
    n = cambiadas = 0
    for f, o in leer_ofertas(a.ofertas):
        t = o.get("taxonomia") or {}
        sin_clasificar = not t.get("sector") and not t.get("familia") and not t.get("stack")
        if not (a.todas or sin_clasificar):
            continue
        n += 1
        nueva = clasificar(o)
        if nueva != t:
            o["taxonomia"] = nueva
            f.write_text(json.dumps(o, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            cambiadas += 1
    print(json.dumps({"revisadas": n, "cambiadas": cambiadas}, ensure_ascii=False))
    return 0


# ───────────────────────── puntuar ─────────────────────────

CEFR = {"a1": 1, "a2": 2, "b1": 3, "b2": 4, "c1": 5, "c2": 6}
_U_ANOS = r"(?:anos?|anys?|years?)"  # «anys»: Feina Activa publica en catalán
_U_MESES = r"(?:mes|meses|mesos|months?)"
_ANOS = re.compile(r"(\d+)\s*\+?\s*" + _U_ANOS + r"(?![a-z])")
_MESES = re.compile(r"(\d+)\s*\+?\s*" + _U_MESES + r"(?![a-z])")
_NO_TEMA = {"anos", "anys", "years", "mes", "meses", "mesos", "months", "experiencia", "experiencias", "minimo", "minima", "menos", "como", "desarrollo"}
# Otros nombres del mismo idioma (en catalán o variantes): se comparan por su nombre de referencia. Lista cerrada en reglas.json.
_IDIOMA_CANON = {norm(k): norm(v) for k, v in REGLAS.get("idiomas_otros_nombres", {}).items()}
_IDIOMAS = list(dict.fromkeys([norm(i) for i in REGLAS["idiomas_conocidos"]] + list(_IDIOMA_CANON)))


def _canon_idioma(nombre) -> str:
    n = norm(nombre)
    return _IDIOMA_CANON.get(n, n)
_VALORA = [norm(x) for x in REGLAS["se_valora"]]
_VACIAS = {norm(x) for x in REGLAS["palabras_vacias"]}
_GENERICAS_TITULO = {"grado", "licenciatura", "diplomatura", "master", "doctorado", "ingenieria", "ciclo", "formativo", "formacion", "profesional", "bachillerato", "titulacion", "titulo", "certificado", "certificada", "carnet", "permiso", "conducir", "universitario", "universitaria", "superior"}
_TITULACION = re.compile(r"(?<![a-z])(grado|licenciatura|diplomatura|master|doctorado|ingenieria|ciclo formativo|formacion profesional|fp|bachillerato|titulacion|titulo de|certificad\w*|carnet|permiso de conducir)")


_FECHA_MES = re.compile(r"(?<!\d)(0?[1-9]|1[0-2])\s*[/.-]\s*((?:19|20)\d{2})(?!\d)|(?<!\d)((?:19|20)\d{2})\s*[/.-]\s*(0?[1-9]|1[0-2])(?!\d)")


def _mes(texto: str) -> int | None:
    """Fecha como número de mes (año × 12 + mes − 1). Lee «03/2020» y «2020-03»; con solo el año cuenta enero,
    así que dos fechas sin mes dan años de calendario, como antes."""
    m = _FECHA_MES.search(texto)
    if m:
        mes, anio = (m.group(1), m.group(2)) if m.group(1) else (m.group(4), m.group(3))
        return int(anio) * 12 + int(mes) - 1
    a = re.search(r"(19|20)\d{2}", texto)
    return int(a.group(0)) * 12 if a else None


def meses_de_experiencia(perfil: dict, hoy_anio: int, tema: list | None = None) -> int | None:
    """Meses cubiertos por las experiencias (unión de intervalos). None si no se pueden leer.
    Con `tema` (palabras ya normalizadas) solo cuentan las experiencias cuyo cargo o descripción las nombran."""
    tramos = []
    for e in perfil.get("experiencias", []):
        if tema:
            txt = norm(" ".join([e.get("cargo", "")] + (e.get("descripcion") or [])))
            if sum(1 for t in tema if _stem(t) in txt) * 2 < len(tema):  # al menos la mitad de las palabras del tema
                continue
        ini = _mes(str(e.get("inicio", ""))[:100])
        if ini is None:
            continue
        fin_txt = norm(e.get("fin", ""))[:100]
        f = _mes(fin_txt)
        if f is None and re.search(r"actual|presente|ahora|hoy", fin_txt):
            f = hoy_anio * 12  # sin mes de hoy: enero, nunca a favor
        if f is not None and f >= ini:
            tramos.append((ini, f))
    if not tramos:
        return None if not tema else 0
    tramos.sort()
    total, (ci, cf) = 0, tramos[0]
    for i, f in tramos[1:]:
        if i <= cf:
            cf = max(cf, f)
        else:
            total += cf - ci
            ci, cf = i, f
    return total + (cf - ci)


def corpus_perfil(perfil: dict) -> str:
    """Todo lo que el perfil dice de su experiencia y formación. NO incluye `respuestas` ni evidencias del perfil humano."""
    partes = [s.get("nombre", "") for s in perfil.get("skills", [])]
    partes += perfil.get("taxonomia", {}).get("stack", [])
    for e in perfil.get("experiencias", []):
        partes.append(e.get("cargo", ""))
        partes += e.get("descripcion", []) or []
    partes += [f.get("titulo", "") for f in perfil.get("formacion", [])]
    return norm(" ".join(partes))


def _tokens(texto: str) -> list:
    return [t for t in re.findall(r"[a-z0-9+#.]{3,}", norm(texto)) if t not in _VACIAS and not t.isdigit()]


def _stem(t: str) -> str:
    return t[:5]


def puesto_de(titulo: str) -> str:
    """El título sin lo que va entre paréntesis («(substitució)», «(Barcelona)»): es el puesto, no sus condiciones."""
    return " ".join(re.sub(r"\([^)]*\)", " ", (titulo or "")[:200]).split())  # tope: un título hostil no encarece la expresión


def evaluar_requisito(req: str, perfil: dict, corpus: str, meses: int | None, hoy_anio: int, titulo: str = "") -> tuple:
    """(valor 0-1 o None si no se puede medir, etiqueta). Solo mira el texto del requisito, el título de la oferta y el perfil."""
    r = " ".join(norm(req).split())  # un solo espacio: «\s*\+?\s*» no se vuelve cuadrático con miles de espacios
    # 1) Idiomas
    for idi in _IDIOMAS:
        if re.search(r"(?<![a-z])" + re.escape(idi) + r"(?![a-z])", r):
            c = _canon_idioma(idi)
            tiene = [i for i in perfil.get("idiomas", []) if (p := _canon_idioma(i.get("idioma", ""))) and (p.startswith(c[:5]) or c.startswith(p[:5]))]
            if not tiene:
                return 0.0, "idioma_falta"
            pedido = re.search(r"\b([abc][12])\b", r)
            nivel_p = norm(tiene[0].get("nivel") or "")
            tengo = re.search(r"\b([abc][12])\b", nivel_p)
            if pedido and tengo:
                return (1.0, "idioma_ok") if CEFR[tengo.group(1)] >= CEFR[pedido.group(1)] else (0.5, "idioma_nivel_menor")
            if pedido and not tengo:
                return 0.5, "idioma_sin_nivel"
            return 1.0, "idioma_ok"
    # 2) Años (o meses) de experiencia. Todo se compara en meses: 1 año = 12 meses (ver meses_de_experiencia).
    patron, unidad, por = _ANOS, _U_ANOS, 12
    m = _ANOS.search(r)
    if not m:
        patron, unidad, por = _MESES, _U_MESES, 1
        m = _MESES.search(r)
    if m:
        if meses is None:
            return None, "anios_no_medibles"
        rango = re.search(r"(\d+)\s*(?:-|a|y|–)\s*(\d+)\s*" + unidad, r)
        pedidos = (int(rango.group(1)) if rango else int(m.group(1))) * por
        if pedidos == 0:
            return 1.0, "anios_ok"
        tema = [t for t in _tokens(patron.sub(" ", r)) if t not in _NO_TEMA]
        sufijo = ""
        if not tema:  # «Experiència 1 anys» a secas: es experiencia en el puesto de la oferta, no en cualquier cosa
            puesto = puesto_de(titulo)
            if es_prohibido(puesto):  # un título que habla de edad, salud, etc. no se usa ni se cita
                return None, "anios_no_medibles"
            tema = [t for t in _tokens(puesto) if t not in _NO_TEMA]
            sufijo = "_puesto" if tema else ""
        if tema:  # años EN ESE TEMA, no años de cualquier cosa
            en_tema = meses_de_experiencia(perfil, hoy_anio, tema)
            meses = en_tema if en_tema is not None else 0
        return (1.0, "anios_ok" + sufijo) if meses >= pedidos else (round(min(1.0, meses / pedidos), 2), "anios_menos" + sufijo)
    # 3) Tecnologías nombradas
    tecs = [t for t, p in _TECNOLOGIAS if p.search(req)]
    if tecs:
        tengo = [t for t in tecs if re.search(r"(?<![a-z0-9])" + re.escape(norm(t)) + r"(?![a-z0-9])", corpus)]
        return round(len(tengo) / len(tecs), 2), "tecnologia"
    # 4) Resto: solape de palabras significativas
    toks = _tokens(req)
    if not toks:
        return None, "sin_palabras"
    if _TITULACION.search(r):
        # Una titulación se mide por su ÁREA, no por la palabra «grado»: «Grado en Enfermería» no se cubre con un grado en otra cosa.
        area = [t for t in toks if t not in _GENERICAS_TITULO]
        toks = area or toks
    cubiertos = sum(1 for t in toks if _stem(t) in corpus)
    frac = cubiertos / len(toks)
    if frac >= 0.6:
        return 1.0, "palabras"
    if frac >= 0.3:
        return 0.5, "palabras"
    # Sin coincidencia: solo cuenta como «te falta» si es una titulación o permiso, que el CV sí dice. Una cualidad
    # («ganas de aprender», «persona organizada») no se puede medir con un CV y no puntúa ni a favor ni en contra.
    if _TITULACION.search(r):
        return 0.0, "titulacion_falta"
    return None, "sin_evidencia"


def _corto(t: str, n: int = 70) -> str:
    t = " ".join(str(t).split())
    return t if len(t) <= n else t[: n - 1].rstrip() + "…"


def _lista(xs: list, tope: int = 4, largo: int = 70) -> str:
    xs = [_corto(x, largo) for x in xs]
    return ", ".join(xs[:tope]) + (f" y {len(xs) - tope} más" if len(xs) > tope else "")


def nota_y_detalle(o: dict, perfil: dict, hoy_anio: int) -> dict:
    reqs = [x for x in o.get("requisitos", []) if isinstance(x, str) and x.strip() and not es_prohibido(x)]
    corpus, meses = corpus_perfil(perfil), meses_de_experiencia(perfil, hoy_anio)
    peso_total = suma = 0.0
    cubre, parcial, falta, sin_medir = [], [], [], []
    for req in reqs:
        v, et = evaluar_requisito(req, perfil, corpus, meses, hoy_anio, o.get("titulo", ""))
        if v is None:
            sin_medir.append(req)
            continue
        if et.endswith("_puesto"):  # que se vea en qué se ha medido
            req = f"{_corto(req, 40)}, como {_corto(puesto_de(o.get('titulo', '')), 50)}"
        w = 0.5 if any(s in norm(req) for s in _VALORA) else 1.0
        peso_total += w
        suma += w * v
        (cubre if v >= 1 else parcial if v > 0 else falta).append((req, et, v))
    nota = round(100 * suma / peso_total) if peso_total else None
    return {"nota": nota, "cubre": cubre, "parcial": parcial, "falta": falta, "sin_medir": sin_medir, "meses": meses}


def condiciones(o: dict, prefs: dict) -> dict:
    """Cada dimensión es 'ok', 'fallo' o None (la oferta o las preferencias no lo dicen: no penaliza)."""
    d = {}
    d["país"] = None if not (prefs.get("paises") and o.get("pais")) else ("ok" if en_lista(o["pais"], prefs["paises"]) else "fallo")
    rem = o.get("remoto", "no_indicado")
    d["modalidad"] = None if not (prefs.get("remoto") and rem != "no_indicado") else ("ok" if en_lista(rem, prefs["remoto"]) else "fallo")
    ciudades, ubic = prefs.get("ciudades"), norm(o.get("ubicacion", ""))
    if not ciudades or not ubic or rem == "remoto":
        d["ciudad"] = None
    else:
        d["ciudad"] = "ok" if any(norm(c) in ubic for c in ciudades) else "fallo"
    d["contrato"] = None if not (prefs.get("contrato") and o.get("contrato")) else ("ok" if en_lista(o["contrato"], prefs["contrato"]) else "fallo")
    d["idioma"] = None if not (prefs.get("idiomas") and o.get("idioma")) else ("ok" if en_lista(o["idioma"], prefs["idiomas"]) else "fallo")
    sal, minimo = o.get("salario") or {}, prefs.get("sueldo_min")
    tope = sal.get("max") if sal.get("max") is not None else sal.get("min")
    if not sal.get("publicado") or minimo is None or tope is None or sal.get("periodo") not in (None, "anual"):
        d["sueldo"] = None
    else:
        d["sueldo"] = "ok" if tope >= minimo else "fallo"
    fallos = [k for k, v in d.items() if v == "fallo"]
    nivel = "encaja" if not fallos else "parcial" if len(fallos) == 1 else "no"
    return {"nivel": nivel, "fallos": fallos, "oks": [k for k, v in d.items() if v == "ok"], "desconocidas": [k for k, v in d.items() if v is None]}


def explicar(o: dict, det: dict, cond: dict) -> str:
    frases = []
    if det["nota"] is None:
        n = len(det["sin_medir"])
        if n == 0:
            frases.append("Sin nota: la oferta no trae requisitos concretos que medir contra tu perfil, y no se inventa una cifra.")
        else:
            cuales = "el único requisito de la oferta no se puede" if n == 1 else f"ninguno de los {n} requisitos de la oferta se puede"
            frases.append(f"Sin nota: {cuales} medir con tu perfil (se miden experiencia, titulación, idiomas y tecnologías), y no se inventa una cifra.")
    else:
        medibles = len(det["cubre"]) + len(det["parcial"]) + len(det["falta"])
        s = f"Cubres {len(det['cubre'])} de {medibles} requisitos medibles"
        if det["cubre"]:
            s += f" ({_lista([r for r, _, _ in det['cubre']], 5)})"
        frases.append(s + ".")
        if det["parcial"]:
            frases.append("En parte: " + _lista([f"{_corto(r)} [{_motivo(et)}]" for r, et, _ in det["parcial"]], 3, 120) + ".")  # el motivo no se corta
        if det["falta"]:
            frases.append("No constan en tu perfil: " + _lista([r for r, _, _ in det["falta"]]) + ".")
        if det["sin_medir"]:
            frases.append(f"{len(det['sin_medir'])} requisito(s) no se pueden medir con tu perfil y no cuentan.")
    c = f"Condiciones: {cond['nivel']}"
    if cond["fallos"]:
        c += " (no coincide: " + ", ".join(cond["fallos"]) + ")"
    elif cond["desconocidas"] and not cond["oks"]:
        c += " (la oferta no dice lo suficiente para comparar)"
    frases.append(c + ".")
    return " ".join(frases)[:1500]


def _motivo(et: str) -> str:
    return {"idioma_nivel_menor": "nivel inferior al pedido", "idioma_sin_nivel": "consta el idioma, no el nivel",
            "anios_menos": "menos años de los pedidos", "anios_menos_puesto": "menos tiempo en ese puesto", "tecnologia": "solo parte de lo nombrado", "palabras": "coincidencia parcial"}.get(et, "parcial")


def puntuar(o: dict, perfil: dict, prefs: dict, hoy_anio: int) -> dict:
    o = {k: v for k, v in o.items() if k != "avisos"}  # lo que no se mira no puede influir
    det = nota_y_detalle(o, perfil, hoy_anio)
    cond = condiciones(o, prefs)
    return {"oferta_id": o["id"], "nota": det["nota"], "nivel_condiciones": cond["nivel"],
            "explicacion": explicar(o, det, cond), "sin_sueldo": not (o.get("salario") or {}).get("publicado")}


def cmd_puntuar(a) -> int:
    hoy = datetime.date.fromisoformat(a.fecha) if a.fecha else datetime.date.today()
    rango = None
    if a.rango:
        if not re.fullmatch(r"[0-9]{1,3}-[0-9]{1,3}", a.rango):
            print("--rango debe tener la forma NN-NN", file=sys.stderr)
            return 2
        rango = tuple(int(x) for x in a.rango.split("-"))
    perfil = json.loads(a.perfil.read_text(encoding="utf-8"))
    prefs = json.loads(a.preferencias.read_text(encoding="utf-8"))
    if rango is None:
        rango = tuple(prefs.get("rango_compatibilidad") or (0, 100))
    ofertas = {}
    for _, o in leer_ofertas(a.ofertas):
        ofertas[o["id"]] = o
    orden = json.loads(a.orden.read_text(encoding="utf-8"))
    # Correcciones de la usuaria ya guardadas: se conservan (no se pierden al recalcular).
    previas = {}
    if a.salida.parent.exists():
        for f in sorted(a.salida.parent.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json")):  # no orden.json
            if f.resolve() == a.salida.resolve():
                continue
            try:
                previo = json.loads(f.read_text(encoding="utf-8"))
                if not isinstance(previo, dict):
                    continue
                for x in previo.get("ofertas", []):
                    if x.get("correccion"):
                        previas[x["oferta_id"]] = x["correccion"]
            except (json.JSONDecodeError, OSError):
                continue
    con_nota, sin_nota = [], []
    for r in orden:
        o = ofertas.get(r["id"])
        if not o:
            continue
        x = puntuar(o, perfil, prefs, hoy.year)
        if r["id"] in previas:
            x["correccion"] = previas[r["id"]]
        if x["nota"] is None:
            sin_nota.append(x)
        elif rango[0] <= x["nota"] <= rango[1]:
            con_nota.append(x)
    con_nota.sort(key=lambda x: -x["nota"])  # estable: a igualdad, el orden del pre-orden
    mt = max(a.perfil.stat().st_mtime, a.preferencias.stat().st_mtime)
    version = datetime.date.fromtimestamp(mt).isoformat()
    salida = {"usuaria_id": perfil["usuaria_id"], "version_perfil": version, "fecha": hoy.isoformat(), "ofertas": con_nota + sin_nota}
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    a.salida.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"puntuadas": len(con_nota), "sin_nota": len(sin_nota), "salida": str(a.salida)}, ensure_ascii=False))
    return 0


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("clasificar")
    c.add_argument("--ofertas", type=Path, required=True)
    c.add_argument("--todas", action="store_true")
    p = sub.add_parser("puntuar")
    p.add_argument("--perfil", type=Path, required=True)
    p.add_argument("--preferencias", type=Path, required=True)
    p.add_argument("--ofertas", type=Path, required=True)
    p.add_argument("--orden", type=Path, required=True)
    p.add_argument("--salida", type=Path, required=True)
    p.add_argument("--rango")
    p.add_argument("--fecha")
    a = ap.parse_args()
    return cmd_clasificar(a) if a.cmd == "clasificar" else cmd_puntuar(a)


if __name__ == "__main__":
    sys.exit(main())
