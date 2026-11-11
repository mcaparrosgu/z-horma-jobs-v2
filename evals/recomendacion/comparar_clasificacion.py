#!/usr/bin/env python3
"""Compara la clasificación en código con la que dejó el agente `clasificador-oferta` en las ofertas ya
procesadas. SOLO LECTURA. Sirve para medir qué se pierde al pasar a reglas (no es un test: las ofertas
reales están en datos/, fuera de git).

Uso: python -I evals/recomendacion/comparar_clasificacion.py [DIR_OFERTAS]   (por defecto datos/ofertas/procesadas)
"""
import importlib.util
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("analizar", RAIZ / ".claude/skills/analisis-ofertas/scripts/analizar.py")
az = importlib.util.module_from_spec(spec)
spec.loader.exec_module(az)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    d = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "datos/ofertas/procesadas"
    n = fam_igual = sec_igual = 0
    fam_agente = fam_codigo = 0
    stack_solape = stack_total = 0
    dif = []
    for f in sorted(d.glob("*.json")):
        o = json.loads(f.read_text(encoding="utf-8"))
        a, c = o.get("taxonomia", {}), az.clasificar(o)
        n += 1
        fam_igual += a.get("familia") == c["familia"]
        sec_igual += a.get("sector") == c["sector"]
        fam_agente += bool(a.get("familia"))
        fam_codigo += bool(c["familia"])
        sa, sc = {az.norm(x) for x in a.get("stack", [])}, {az.norm(x) for x in c["stack"]}
        stack_total += len(sa)
        stack_solape += len(sa & sc)
        if a.get("familia") != c["familia"]:
            dif.append((o.get("titulo", "")[:50], a.get("familia"), c["familia"]))
    print(f"ofertas: {n}")
    print(f"familia igual: {fam_igual}/{n} · sector igual: {sec_igual}/{n}")
    print(f"con familia — agente: {fam_agente} · código: {fam_codigo}")
    print(f"stack del agente recuperado por el código: {stack_solape}/{stack_total}")
    for t in dif[:40]:
        print("  difiere:", t)
    return 0


if __name__ == "__main__":
    sys.exit(main())
