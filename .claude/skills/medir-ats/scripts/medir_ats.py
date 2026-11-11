#!/usr/bin/env python3
"""Mide la cobertura de palabras clave de una oferta en un CV adaptado. Código, no juicio.

Uso:
    python -I medir_ats.py --cv cv.md --oferta oferta.json --perfil perfil.json --salida ats.json

Palabras clave = oferta.taxonomia.stack + los requisitos de hasta 4 palabras.
Los requisitos más largos son frases libres: no se miden (salen en `no_medidos`).
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


def palabras_clave(oferta: dict):
    claves, no_medidos, vistos = [], [], set()
    candidatas = list(oferta.get("taxonomia", {}).get("stack", [])) + list(oferta.get("requisitos", []))
    for c in candidatas:
        c = re.sub(r"\s*\([^)]*\)", "", c[:200]).strip()  # «Inglés B2 (se valora)» -> «Inglés B2»; tope: una oferta hostil no encarece la expresión
        n = norm(c)
        if not n or n in vistos:
            continue
        vistos.add(n)
        if len(n.split()) <= 4:
            claves.append(c)
        else:
            no_medidos.append(c)
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
