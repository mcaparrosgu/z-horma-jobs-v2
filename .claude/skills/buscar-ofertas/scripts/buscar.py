#!/usr/bin/env python3
"""Filtro duro y pre-orden de ofertas para una usuaria. Código, sin LLM y sin embeddings.

Uso:
    python -I buscar.py --preferencias P.json --perfil PERFIL.json --ofertas DIR [--salida S.json]

Filtro duro (lee preferencias.json): país, contrato, remoto, idioma, nivel, sector y sueldo mínimo.
Reglas:
  - Un dato que la oferta no trae («no_indicado», nulo) NO descarta la oferta.
  - Una oferta sin sueldo publicado NO se descarta: sale con sin_sueldo = true.
  - Una oferta con `fecha_cierre` anterior a hoy SÍ se descarta (ya cerró; la web también la oculta).
Pre-orden (no descarta nada, solo decide el turno): coincidencia de taxonomía entre perfil y
oferta (sector, familia, nivel, stack en común) y, a igualdad, la fecha más reciente.
Salida: lista JSON ordenada con id, puntos_taxonomia, sin_sueldo y fecha.
Solo biblioteca estándar. En la web, la misma lógica es una consulta SQL.
"""
import argparse
import json
import sys
import unicodedata
from datetime import date
from pathlib import Path


def norm(x) -> str:
    t = unicodedata.normalize("NFKD", str(x))
    return "".join(c for c in t if not unicodedata.combining(c)).strip().lower()


def en_lista(valor, lista) -> bool:
    return norm(valor) in {norm(v) for v in lista}


def pasa_filtro(o: dict, p: dict, hoy: str | None = None) -> tuple:
    """Devuelve (pasa, sin_sueldo). `hoy` (AAAA-MM-DD) activa la regla de las ofertas cerradas."""
    # Una oferta con fecha_cierre anterior a hoy ya no se recomienda (calidad de ofertas, A1). Solo hechos.
    if hoy and o.get("fecha_cierre") and o["fecha_cierre"] < hoy:
        return False, False
    # Una oferta que la auditoría marcó como posible fraude no se recomienda (orden de Mar, 10-nov). Solo hechos de la auditoría.
    if ((o.get("auditoria") or {}).get("fraude") or {}).get("sospechosa") is True:
        return False, False
    if p.get("paises") and o.get("pais") and not en_lista(o["pais"], p["paises"]):
        return False, False
    if p.get("contrato") and o.get("contrato") and not en_lista(o["contrato"], p["contrato"]):
        return False, False
    r = o.get("remoto", "no_indicado")
    if p.get("remoto") and r != "no_indicado" and not en_lista(r, p["remoto"]):
        return False, False
    if p.get("idiomas") and o.get("idioma") and not en_lista(o["idioma"], p["idiomas"]):
        return False, False
    n = o.get("nivel", "no_indicado")
    if p.get("niveles") and n != "no_indicado" and not en_lista(n, p["niveles"]):
        return False, False
    sector = o.get("taxonomia", {}).get("sector")
    if p.get("sectores") and sector and not en_lista(sector, p["sectores"]):
        return False, False
    sal = o.get("salario", {})
    if not sal.get("publicado"):
        return True, True
    minimo = p.get("sueldo_min")
    tope = sal.get("max") if sal.get("max") is not None else sal.get("min")
    if minimo is not None and tope is not None and sal.get("periodo") in (None, "anual") and tope < minimo:
        return False, False
    return True, False


def nivel_del_perfil(pt: dict, familia) -> str | None:
    """Nivel de la candidata para la familia de la oferta; si no tiene el suyo, el general."""
    if isinstance(familia, str) and familia:
        for x in pt.get("niveles_por_familia") or []:
            if isinstance(x, dict) and isinstance(x.get("familia"), str) and norm(x["familia"]) == norm(familia):
                return x.get("nivel") or pt.get("nivel")
    return pt.get("nivel")


def puntos(o: dict, perfil: dict) -> int:
    t, pt = o.get("taxonomia", {}), perfil.get("taxonomia", {})
    total = 0
    if t.get("sector") and en_lista(t["sector"], pt.get("sectores", [])):
        total += 3
    if t.get("familia") and en_lista(t["familia"], pt.get("familias", [])):
        total += 3
    nivel = nivel_del_perfil(pt, t.get("familia"))
    if o.get("nivel") and nivel and norm(o["nivel"]) == norm(nivel):
        total += 2
    comunes = {norm(s) for s in t.get("stack", [])} & {norm(s) for s in pt.get("stack", [])}
    return total + len(comunes)


def main() -> int:
    # En Windows la consola usa cp1252: se fuerza UTF-8 para tildes y eñes.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preferencias", type=Path, required=True)
    ap.add_argument("--perfil", type=Path, required=True)
    ap.add_argument("--ofertas", type=Path, required=True)
    ap.add_argument("--salida", type=Path)
    ap.add_argument("--hoy", help="AAAA-MM-DD; por defecto, la fecha de hoy (solo para pruebas)")
    a = ap.parse_args()
    prefs = json.loads(a.preferencias.read_text(encoding="utf-8"))
    perfil = json.loads(a.perfil.read_text(encoding="utf-8"))
    resultado = []
    for f in sorted(a.ofertas.glob("*.json")):
        o = json.loads(f.read_text(encoding="utf-8"))
        ok, sin_sueldo = pasa_filtro(o, prefs, a.hoy or date.today().isoformat())
        if ok:
            resultado.append({"id": o["id"], "puntos_taxonomia": puntos(o, perfil),
                              "sin_sueldo": sin_sueldo, "fecha": o.get("fecha")})
    resultado.sort(key=lambda r: (r["puntos_taxonomia"], r["fecha"] or ""), reverse=True)
    texto = json.dumps(resultado, ensure_ascii=False, indent=2)
    if a.salida:
        a.salida.parent.mkdir(parents=True, exist_ok=True)
        a.salida.write_text(texto, encoding="utf-8")
    print(texto)
    return 0


if __name__ == "__main__":
    sys.exit(main())
