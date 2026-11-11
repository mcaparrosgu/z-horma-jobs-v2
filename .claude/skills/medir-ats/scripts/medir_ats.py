#!/usr/bin/env python3
"""Mide la cobertura de palabras clave de una oferta en un CV adaptado. Código, no juicio.

Uso:
    python -I medir_ats.py --cv cv.md --oferta oferta.json --perfil perfil.json --salida ats.json

Palabras clave = oferta.taxonomia.stack + los requisitos de hasta 4 palabras, sin prefijos de relleno
(«Conocimientos de Python» -> «Python»; «Coneixement A3» -> «A3», que no se repite si ya está).
Salen en `no_medidos` (no verificados, nunca «sin origen»):
  - las frases de más de 4 palabras;
  - los años o meses de experiencia («2 años», «Experiència 2 anys»): un CV dice fechas, no cifras de años;
  - si la oferta declara un idioma distinto del español, sus requisitos (solo se miden las tecnologías del
    stack, que se escriben igual en todos los idiomas). No hay diccionario de traducción.
Una palabra ausente del CV se clasifica así:
  - faltantes_con_origen: aparece en el perfil de la usuaria (se sugiere al redactor)
  - faltantes_sin_origen: no aparece en el perfil (se avisa a la usuaria; NUNCA se inserta)
Solo biblioteca estándar.
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path


def norm(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


SUFIJO_NIVEL = re.compile(r"\s+o\s+(superior|mas|mayor|equivalente|similar)$")


def sin_sufijo(clave_n: str) -> str:
    """«ingles b2 o superior» se mide como «ingles b2»: un CV que dice B2 cumple «B2 o superior»."""
    return SUFIJO_NIVEL.sub("", clave_n)


def contiene(texto_n: str, clave_n: str) -> bool:
    """Coincidencia de palabra completa (para que «r» no case dentro de «proyecto»)."""
    return re.search(r"(?<![a-z0-9+#])" + re.escape(clave_n) + r"(?![a-z0-9+#])", texto_n) is not None


TIEMPO = re.compile(r"\d+\s*\+?\s*(?:anos?|anys?|years?|mes|meses|mesos|months?)(?![a-z])")
PREFIJO = re.compile(r"^(?:compet[eè]ncias?\s*/\s*conocimientos|compet[eè]ncies\s*/\s*coneixements|conocimientos?|coneixements?|experi[eè]ncias?)"
                     r"(?:\s*:\s*|\s+(?:de\s+|en\s+|d['’])?)", re.IGNORECASE)
ESPANOL = {"", "es", "espanol", "castellano", "spanish"}


def palabras_clave(oferta: dict):
    claves, no_medidos, vistos = [], [], set()
    otro_idioma = norm(oferta.get("idioma") or "") not in ESPANOL
    stack = list(oferta.get("taxonomia", {}).get("stack", []))
    for i, original in enumerate(stack + list(oferta.get("requisitos", []))):
        es_stack = i < len(stack)
        original = re.sub(r"\s*\([^)]*\)", "", original[:200]).strip()  # «Inglés B2 (se valora)» -> «Inglés B2»; tope: una oferta hostil no encarece la expresión
        if not es_stack and TIEMPO.search(norm(original)):
            no_medidos.append(original)
            continue
        c = original if es_stack else (PREFIJO.sub("", original).strip() or original)
        n = norm(c)
        if not n or n in vistos:
            continue
        vistos.add(n)
        if es_stack or (not otro_idioma and len(n.split()) <= 4):
            claves.append(c)
        else:
            no_medidos.append(original)
    return claves, no_medidos


def texto_perfil(perfil: dict) -> str:
    return norm(json.dumps(perfil, ensure_ascii=False))


def main() -> int:
    # En Windows la consola usa cp1252: se fuerza UTF-8 para tildes y eñes.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cv", type=Path, required=True)
    ap.add_argument("--oferta", type=Path, required=True)
    ap.add_argument("--perfil", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    a = ap.parse_args()
    cv_n = norm(a.cv.read_text(encoding="utf-8"))
    oferta = json.loads(a.oferta.read_text(encoding="utf-8"))
    perfil_n = texto_perfil(json.loads(a.perfil.read_text(encoding="utf-8")))

    claves, no_medidos = palabras_clave(oferta)
    presentes, con_origen, sin_origen = [], [], []
    for c in claves:
        n = sin_sufijo(norm(c))
        if contiene(cv_n, n):
            presentes.append(c)
        elif contiene(perfil_n, n):
            con_origen.append(c)
        else:
            sin_origen.append(c)
    cobertura = round(len(presentes) / len(claves), 3) if claves else 1.0
    salida = {"cobertura": cobertura, "faltantes_con_origen": con_origen,
              "faltantes_sin_origen": sin_origen, "presentes": presentes, "no_medidos": no_medidos}
    a.salida.parent.mkdir(parents=True, exist_ok=True)
    a.salida.write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(salida, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
