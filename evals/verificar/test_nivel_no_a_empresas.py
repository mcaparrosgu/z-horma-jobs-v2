"""Línea roja: el nivel por familia es de uso interno y nunca llega a una vista de empresa.

Falla si `niveles_por_familia` aparece en el código de la web fuera de la ficha de candidatas (que ve la
administración), o en cualquier ruta que sea de empresas o del portal. Sin red ni LLM.
"""
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CAMPO = "niveles_por_familia"
PERMITIDOS = {"web/src/app/candidatos/[id]/page.tsx"}
CARPETAS = ("web/src", "web/scripts")
EXTENSIONES = {".ts", ".tsx", ".js", ".mjs", ".sql"}


def usos():
    for c in CARPETAS:
        for f in (RAIZ / c).rglob("*"):
            if f.is_file() and f.suffix in EXTENSIONES and "node_modules" not in f.parts:
                if CAMPO in f.read_text(encoding="utf-8", errors="replace"):
                    yield f.relative_to(RAIZ).as_posix()


class TestNivelNoAEmpresas(unittest.TestCase):
    def test_solo_aparece_en_la_ficha_de_candidatas(self):
        fuera = [u for u in usos() if u not in PERMITIDOS]
        self.assertEqual(fuera, [], f"{CAMPO} no puede salir de la ficha de candidatas: {fuera}")

    def test_ninguna_ruta_de_empresas_lo_usa(self):
        empresas = [u for u in usos() if any(p in u.lower() for p in ("empresa", "portal"))]
        self.assertEqual(empresas, [])

    def test_la_ficha_permitida_sigue_existiendo(self):
        # Si la ficha se renombra, este test avisa para actualizar la lista en vez de dejarla muerta.
        self.assertTrue((RAIZ / next(iter(PERMITIDOS))).is_file())


if __name__ == "__main__":
    unittest.main()
