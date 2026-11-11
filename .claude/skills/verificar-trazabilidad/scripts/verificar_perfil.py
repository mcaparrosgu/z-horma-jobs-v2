#!/usr/bin/env python3
"""Verifica que cada `origen` de perfil.json es real. Código determinista, sin LLM.

Uso:
    python -I verificar_perfil.py <carpeta-usuaria>      (p. ej. datos/usuarias/<id>)

Para cada `origen` {archivo, fragmento, linea} de perfil.json (experiencias, formación, skills,
idiomas y niveles_por_familia) comprueba que:
  1. el archivo existe dentro de <carpeta>/fuentes/ (sin rutas con «..» ni absolutas);
  2. el fragmento aparece literalmente en ese archivo;
  3. si hay `linea`, el fragmento está en esa línea.
La salida solo lleva rutas JSON y motivos, nunca el texto del CV. Código de salida 1 si algo falla.
Solo biblioteca estándar.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path


def norm(texto: str) -> str:
    t = unicodedata.normalize("NFKD", str(texto))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t.replace("–", "-").replace("—", "-")).strip().lower()


def origenes(nodo, ruta="perfil"):
    """Recorre el JSON y devuelve (ruta, origen) de cada clave `origen`."""
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            if k == "origen" and isinstance(v, dict):
                yield f"{ruta}.origen", v
            else:
                yield from origenes(v, f"{ruta}.{k}")
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from origenes(v, f"{ruta}[{i}]")


def verificar(carpeta: Path) -> list:
    errores = []
    perfil_ruta = carpeta / "perfil.json"
    if not perfil_ruta.is_file():
        return [{"tipo": "falta_archivo", "detalle": "perfil.json"}]
    try:
        perfil = json.loads(perfil_ruta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return [{"tipo": "json_invalido", "detalle": "perfil.json"}]
    fuentes = (carpeta / "fuentes").resolve()
    cache = {}
    for ruta, o in origenes(perfil):
        archivo, frag, linea = o.get("archivo"), o.get("fragmento"), o.get("linea")
        if not isinstance(archivo, str) or not isinstance(frag, str) or not frag.strip():
            errores.append({"tipo": "origen_incompleto", "detalle": ruta})
            continue
        destino = (fuentes / archivo).resolve()
        if fuentes not in destino.parents or not destino.is_file():
            errores.append({"tipo": "archivo_de_origen_no_existe", "detalle": ruta})
            continue
        if destino not in cache:
            cache[destino] = destino.read_text(encoding="utf-8").split("\n")
        lineas = cache[destino]
        if not any(norm(frag) in norm(l) for l in lineas):
            errores.append({"tipo": "fragmento_no_esta_en_el_archivo", "detalle": ruta})
        elif isinstance(linea, int) and not (1 <= linea <= len(lineas) and norm(frag) in norm(lineas[linea - 1])):
            errores.append({"tipo": "fragmento_no_esta_en_esa_linea", "detalle": ruta})
    return errores


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    errores = verificar(Path(sys.argv[1]))
    print(json.dumps({"ok": not errores, "errores": errores}, ensure_ascii=False, indent=2))
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
