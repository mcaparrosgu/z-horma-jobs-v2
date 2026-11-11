#!/usr/bin/env python3
"""Hook PostToolUse de Claude Code: cada vez que se escribe un cv.md de una candidatura,
corre verificar.py sobre su carpeta. Si falla, imprime los errores por stderr y sale con
código 2: Claude Code se los muestra al agente en el mismo turno.

Lee del stdin el JSON del evento ({"tool_input": {"file_path": ...}}). Cualquier otro
archivo se ignora (salida 0).
"""
import json
import subprocess
import sys
from pathlib import Path


def main() -> int:
    # En Windows la consola usa cp1252: se fuerza UTF-8 para tildes y eñes.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        evento = json.load(sys.stdin)
        ruta = Path(evento.get("tool_input", {}).get("file_path", ""))
    except (json.JSONDecodeError, AttributeError):
        return 0
    try:
        ruta = ruta.resolve()
        en_datos = ruta.name == "cv.md" and ruta.parents[2].name == "candidaturas" and ruta.parents[3].name == "datos"
    except (IndexError, OSError):
        return 0
    if not en_datos:
        return 0
    verificar = Path(__file__).with_name("verificar.py")
    r = subprocess.run([sys.executable, "-I", str(verificar), str(ruta.parent)],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        sys.stderr.write("verificar-trazabilidad: el CV no pasa la verificación.\n" + r.stdout)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
