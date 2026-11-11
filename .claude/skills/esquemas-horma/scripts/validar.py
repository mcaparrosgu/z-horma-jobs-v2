#!/usr/bin/env python3
"""Valida un JSON contra uno de los esquemas de esquemas-horma. Solo biblioteca estándar.

Uso:
    python -I validar.py <esquema> <archivo.json>
    <esquema> = nombre sin extensión (oferta, perfil, preferencias, cv-base, match,
                candidatura, calificacion-fuente, endpoints) o ruta a un .json de esquema.

Soporta el subconjunto de JSON Schema que usan los esquemas de Horma: type (incluida la lista
de tipos), enum, pattern, minLength, maxLength, minimum, maximum, minItems, maxItems, required, properties,
additionalProperties (false), items y $ref a #/$defs/.
Salida: JSON {ok, errores:[«ruta: problema»]}. Código 1 si hay errores.
"""
import json
import re
import sys
from pathlib import Path

ESQUEMAS = Path(__file__).resolve().parent.parent / "schemas"
TIPOS = {"string": str, "number": (int, float), "integer": int, "boolean": bool,
         "array": list, "object": dict, "null": type(None)}


def tipo_ok(valor, tipo) -> bool:
    if tipo in ("number", "integer") and isinstance(valor, bool):
        return False
    return isinstance(valor, TIPOS[tipo])


def validar(valor, esq, raiz, ruta, errores):
    if "$ref" in esq:
        destino = raiz
        for parte in esq["$ref"].lstrip("#/").split("/"):
            destino = destino[parte]
        return validar(valor, destino, raiz, ruta, errores)
    if "enum" in esq and valor not in esq["enum"]:
        errores.append(f"{ruta}: {valor!r} no está en {esq['enum']}")
        return
    if "type" in esq:
        tipos = esq["type"] if isinstance(esq["type"], list) else [esq["type"]]
        if not any(tipo_ok(valor, t) for t in tipos):
            errores.append(f"{ruta}: se esperaba {tipos} y llegó {type(valor).__name__}")
            return
    if isinstance(valor, str):
        if "minLength" in esq and len(valor) < esq["minLength"]:
            errores.append(f"{ruta}: menos de {esq['minLength']} caracteres")
        if "maxLength" in esq and len(valor) > esq["maxLength"]:
            errores.append(f"{ruta}: más de {esq['maxLength']} caracteres")
    if isinstance(valor, str) and "pattern" in esq and not re.search(esq["pattern"], valor):
        errores.append(f"{ruta}: {valor!r} no cumple el patrón {esq['pattern']}")
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        if "minimum" in esq and valor < esq["minimum"]:
            errores.append(f"{ruta}: {valor} < {esq['minimum']}")
        if "maximum" in esq and valor > esq["maximum"]:
            errores.append(f"{ruta}: {valor} > {esq['maximum']}")
    if isinstance(valor, dict):
        props = esq.get("properties", {})
        for k in esq.get("required", []):
            if k not in valor:
                errores.append(f"{ruta}: falta la clave obligatoria «{k}»")
        if esq.get("additionalProperties") is False:
            for k in valor:
                if k not in props:
                    errores.append(f"{ruta}: clave no permitida «{k}»")
        for k, v in valor.items():
            sub = props.get(k, esq.get("additionalProperties") if isinstance(esq.get("additionalProperties"), dict) else None)
            if sub:
                validar(v, sub, raiz, f"{ruta}.{k}", errores)
    if isinstance(valor, list):
        if "minItems" in esq and len(valor) < esq["minItems"]:
            errores.append(f"{ruta}: menos de {esq['minItems']} elementos")
        if "maxItems" in esq and len(valor) > esq["maxItems"]:
            errores.append(f"{ruta}: más de {esq['maxItems']} elementos")
        if "items" in esq:
            for i, v in enumerate(valor):
                validar(v, esq["items"], raiz, f"{ruta}[{i}]", errores)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    nombre, archivo = sys.argv[1], Path(sys.argv[2])
    ruta_esq = Path(nombre) if nombre.endswith(".json") else ESQUEMAS / f"{nombre}.json"
    esq = json.loads(ruta_esq.read_text(encoding="utf-8"))
    errores = []
    try:
        datos = json.loads(archivo.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errores.append(f"JSON inválido: {e}")
    else:
        validar(datos, esq, esq, "$", errores)
    print(json.dumps({"ok": not errores, "errores": errores}, ensure_ascii=False, indent=2))
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
