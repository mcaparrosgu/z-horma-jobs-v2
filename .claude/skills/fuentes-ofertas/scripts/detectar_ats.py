#!/usr/bin/env python3
"""Detecta qué ATS usa una empresa mirando adónde enlaza su página de empleo.

Solo biblioteca estándar. Por empresa hace COMO MUCHO UNA visita a UNA página pública
(la de «Trabaja con nosotros»), después de leer su robots.txt. NO lee ni cuenta las ofertas
del ATS: leer el endpoint de un ATS sin permiso es zona dudosa (ver
v1 archivada, sección 3.4) y es decisión de Mar.

Uso:
    python -I detectar_ats.py lista.csv                 # simulacro: solo muestra qué haría
    python -I detectar_ats.py lista.csv --ejecutar      # hace las visitas (1 por empresa)
    python -I detectar_ats.py lista.csv --ejecutar --salida resultado.json

lista.csv: columnas `empresa,url_empleo` (url_empleo = página pública de empleo, https).
Salida: JSON con, por empresa, `ats`, `slug`, `endpoint_publico` (SOLO como texto, no se
visita) y `estado` (detectado | sin_ats | bloqueado_por_robots | error:<código>).
"""
import csv
import ipaddress
import json
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

UA = "HormaJobs-deteccion/0.1 (investigacion; contacto en el repositorio mcaparrosgu/horma-jobs)"
PAUSA_S = 3.0          # entre empresas
TOPE_BYTES = 1_000_000  # por página
TIMEOUT_S = 15

# (nombre del ATS, patrón sobre la URL de un enlace, plantilla del endpoint público que NO se visita)
ATS = [
    ("greenhouse", r"(?:boards|job-boards)\.greenhouse\.io/(?:embed/job_board\?for=)?([\w-]+)",
     "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"),
    ("lever", r"jobs\.lever\.co/([\w-]+)", "https://api.lever.co/v0/postings/{slug}?mode=json"),
    ("ashby", r"jobs\.ashbyhq\.com/([\w.-]+)", "https://api.ashbyhq.com/posting-api/job-board/{slug}"),
    ("smartrecruiters", r"(?:jobs|careers)\.smartrecruiters\.com/([\w-]+)",
     "https://api.smartrecruiters.com/v1/companies/{slug}/postings"),
    ("recruitee", r"([\w-]+)\.recruitee\.com", "https://{slug}.recruitee.com/api/offers/"),
    ("teamtailor", r"([\w-]+)\.teamtailor\.com", "https://{slug}.teamtailor.com/jobs.rss"),
    ("workable", r"apply\.workable\.com/([\w-]+)", "https://apply.workable.com/api/v1/widget/accounts/{slug}"),
    ("personio", r"([\w-]+)\.jobs\.personio\.(?:de|com)", "https://{slug}.jobs.personio.de/xml"),
    ("factorial", r"([\w-]+)\.factorialhr\.(?:com|es)/job_posting", None),
    ("bizneo", r"([\w-]+)\.bizneohr\.com|([\w-]+)\.bizneo\.cloud", None),
    ("sesame", r"([\w-]+)\.sesametime\.com/(?:careers|jobs)", None),
    ("hiringroom", r"([\w-]+)\.hiringroom\.com", None),
]
_COMPILADOS = [(n, re.compile(p, re.I), plantilla) for n, p, plantilla in ATS]
_ENLACES = re.compile(r"""(?:href|src|data-src|action)\s*=\s*["']([^"']+)["']""", re.I)


def detectar(html: str, url_base: str = ""):
    """Función pura. Devuelve la primera coincidencia {ats, slug, endpoint_publico} o None."""
    for enlace in _ENLACES.findall(html):
        url = urllib.parse.urljoin(url_base, enlace)
        for nombre, patron, plantilla in _COMPILADOS:
            m = patron.search(url)
            if m:
                slug = next((g for g in m.groups() if g), "")
                if slug.lower() in {"www", "api", "careers", "jobs", "embed"}:
                    continue
                return {"ats": nombre, "slug": slug,
                        "endpoint_publico": plantilla.format(slug=slug) if plantilla else None}
    return None


def _url_publica_https(url: str) -> bool:
    p = urllib.parse.urlparse(url)
    if p.scheme != "https" or not p.hostname:
        return False
    try:
        return all(ipaddress.ip_address(i[4][0]).is_global for i in socket.getaddrinfo(p.hostname, 443))
    except (socket.gaierror, ValueError):
        return False


def _robots_permite(url: str) -> bool:
    p = urllib.parse.urlparse(url)
    rp = urllib.robotparser.RobotFileParser(f"{p.scheme}://{p.netloc}/robots.txt")
    try:
        rq = urllib.request.Request(rp.url, headers={"User-Agent": UA})
        with urllib.request.urlopen(rq, timeout=TIMEOUT_S) as r:
            rp.parse(r.read(TOPE_BYTES).decode("utf-8", "replace").splitlines())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return False        # robots prohibido: se trata como bloqueo
        return True             # 404 y similares: sin robots = sin restricción
    except Exception:
        return False            # ante la duda, no se visita
    return rp.can_fetch(UA, url)


def visitar(url: str) -> str:
    rq = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(rq, timeout=TIMEOUT_S) as r:
        return r.read(TOPE_BYTES).decode("utf-8", "replace")


def procesar(filas, ejecutar: bool):
    res = []
    for i, f in enumerate(filas):
        empresa, url = f["empresa"].strip(), f["url_empleo"].strip()
        r = {"empresa": empresa, "url_empleo": url}
        if not _url_publica_https(url):
            r["estado"] = "error:url_no_valida_o_no_publica"
        elif not ejecutar:
            r["estado"] = "simulacro"
        elif not _robots_permite(url):
            r["estado"] = "bloqueado_por_robots"
        else:
            try:
                d = detectar(visitar(url), url)
                r.update(d or {})
                r["estado"] = "detectado" if d else "sin_ats"
            except urllib.error.HTTPError as e:
                r["estado"] = f"error:{e.code}"
            except Exception:
                r["estado"] = "error:red"
            if i < len(filas) - 1:
                time.sleep(PAUSA_S)
        res.append(r)
    return res


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    ejecutar = "--ejecutar" in argv
    salida = argv[argv.index("--salida") + 1] if "--salida" in argv else None
    with open(argv[0], newline="", encoding="utf-8") as fh:
        filas = list(csv.DictReader(fh))
    if not ejecutar:
        print(f"SIMULACRO: {len(filas)} empresas; no se visita nada. Añade --ejecutar para hacerlo.", file=sys.stderr)
    res = procesar(filas, ejecutar)
    texto = json.dumps(res, ensure_ascii=False, indent=2)
    if salida:
        with open(salida, "w", encoding="utf-8") as fh:
            fh.write(texto)
    else:
        print(texto)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
