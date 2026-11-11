#!/usr/bin/env python3
"""Archivo dorado del análisis de ofertas: casos de entrada y la respuesta exacta de analizar.py.

Sirve de contrato para la versión TypeScript de la web: debe devolver lo mismo, caso por caso
(web/src/lib/analisis-ofertas.test.ts leerá evals/recomendacion/golden-analisis.json).

Uso:
    python -I evals/recomendacion/golden_analisis.py --escribir     # regenera golden-analisis.json (tras cambiar reglas.json o analizar.py)
    python -I evals/recomendacion/golden_analisis.py                # comprueba que el archivo está al día (sale 1 si no)
Datos inventados; nada de personas reales.
"""
import importlib.util
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
GOLDEN = Path(__file__).resolve().parent / "golden-analisis.json"
spec = importlib.util.spec_from_file_location("analizar", RAIZ / ".claude/skills/analisis-ofertas/scripts/analizar.py")
az = importlib.util.module_from_spec(spec)
spec.loader.exec_module(az)

ORIGEN = {"archivo": "cv.md", "fragmento": "x", "linea": 1}
ANIO = 2026


def oferta(**kw):
    base = {"id": "of-1", "fuente": "fixture", "url": "https://ejemplo.invalid/1", "fecha": "2026-11-01", "titulo": "Analista de datos",
            "empresa": "Empresa Inventada S.L.", "ubicacion": "Madrid", "pais": "ES", "remoto": "hibrido", "contrato": "indefinido",
            "idioma": "español", "nivel": "junior", "requisitos": ["SQL", "Python", "Inglés B2"],
            "salario": {"publicado": False, "min": None, "max": None, "moneda": None, "periodo": None},
            "taxonomia": {"sector": None, "familia": None, "stack": []},
            "auditoria": {"fantasma": {}, "fraude": {}, "empresa_validada": {"valor": "no_comprobada", "motivo": ""}, "transparencia": {}, "instrucciones_embebidas": []}}
    base.update(kw)
    return base


def perfil(**kw):
    base = {"usuaria_id": "ana-prueba",
            "experiencias": [{"cargo": "Analista de datos", "empresa": "X", "inicio": "2020", "fin": "2024", "descripcion": ["Automaticé informes con Python y SQL"], "origen": ORIGEN}],
            "formacion": [{"titulo": "Grado en Administración de Empresas", "centro": "U", "fin": "2016", "origen": ORIGEN}],
            "skills": [{"nombre": "Python", "origen": ORIGEN}, {"nombre": "SQL", "origen": ORIGEN}],
            "idiomas": [{"idioma": "Inglés", "nivel": "B2", "origen": ORIGEN}],
            "taxonomia": {"sectores": ["datos"], "familias": ["analisis de datos"], "nivel": "junior", "stack": ["Python", "SQL"]},
            "preguntas_pendientes": []}
    base.update(kw)
    return base


PREFS = {"puestos": [], "ciudades": ["Madrid"], "paises": ["ES"], "remoto": ["hibrido", "remoto"], "contrato": ["indefinido"],
         "idiomas": ["español", "inglés"], "sueldo_min": None, "rango_compatibilidad": [0, 100]}
SAL_BAJO = {"publicado": True, "min": 20000, "max": 24000, "moneda": "EUR", "periodo": "anual"}

CASOS = [
    ("cubre todo", oferta(), perfil(), PREFS),
    ("falta una tecnología", oferta(requisitos=["SQL", "Python", "Tableau", "Figma"]), perfil(), PREFS),
    ("se valora pesa la mitad", oferta(requisitos=["SQL", "Tableau (se valora)"]), perfil(), PREFS),
    ("idioma con nivel menor", oferta(requisitos=["Inglés B2"]), perfil(idiomas=[{"idioma": "Inglés", "nivel": "B1", "origen": ORIGEN}]), PREFS),
    ("idioma sin nivel en el perfil", oferta(requisitos=["Inglés B2"]), perfil(idiomas=[{"idioma": "Inglés", "nivel": None, "origen": ORIGEN}]), PREFS),
    ("años de experiencia (suficientes)", oferta(requisitos=["3 años de experiencia"]), perfil(), PREFS),
    ("años de experiencia (insuficientes)", oferta(requisitos=["10 años de experiencia"]), perfil(), PREFS),
    ("años en un tema que el perfil no tiene", oferta(requisitos=["2-5 años de experiencia en desarrollo Android"]), perfil(), PREFS),
    ("sin requisitos", oferta(requisitos=[]), perfil(), PREFS),
    ("requisito prohibido se ignora", oferta(requisitos=["SQL", "Menor de 30 años", "Buena presencia"]), perfil(), PREFS),
    ("avisos no influyen", oferta(avisos=[{"tipo": "ciudadania", "texto": "Nacionalidad española"}]), perfil(), PREFS),
    ("contrato distinto: parcial", oferta(contrato="temporal"), perfil(), PREFS),
    ("dos fallos de condiciones: no", oferta(contrato="temporal", remoto="presencial"), perfil(), PREFS),
    ("la oferta no dice nada: encaja", oferta(contrato="", remoto="no_indicado", pais=None), perfil(), PREFS),
    ("sueldo por debajo del mínimo", oferta(salario=SAL_BAJO), perfil(), dict(PREFS, sueldo_min=30000)),
    ("título ambiguo", oferta(titulo="Persona para nuestro equipo", requisitos=["Ganas de aprender"]), perfil(), PREFS),
    ("empate frontend y backend", oferta(titulo="Frontend y backend developer", requisitos=[]), perfil(), PREFS),
    ("mantenimiento en catalán", oferta(titulo="OPERARI/ÀRIA DE MANTENIMENT", requisitos=["Experiència 1 any en mantenimiento industrial"], idioma="catalán"), perfil(), PREFS),
    ("developer solo da sector", oferta(titulo="Software Developer", requisitos=["Java", "Docker"]), perfil(), PREFS),
]


def generar() -> list:
    salida = []
    for nombre, o, p, pr in CASOS:
        salida.append({"nombre": nombre, "anio": ANIO, "oferta": o, "perfil": p, "preferencias": pr,
                       "esperado": {"taxonomia": az.clasificar(o), "match": az.puntuar(o, p, pr, ANIO)}})
    return salida


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    texto = json.dumps(generar(), ensure_ascii=False, indent=2) + "\n"
    if "--escribir" in sys.argv:
        GOLDEN.write_text(texto, encoding="utf-8", newline="\n")
        print(f"escrito {GOLDEN.name}: {len(CASOS)} casos")
        return 0
    if not GOLDEN.exists() or GOLDEN.read_text(encoding="utf-8").replace("\r\n", "\n") != texto:
        print("golden-analisis.json NO está al día: ejecuta con --escribir y revisa el cambio")
        return 1
    print(f"golden-analisis.json al día ({len(CASOS)} casos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
