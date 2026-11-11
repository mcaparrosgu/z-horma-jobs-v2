"""Tests de verificar_perfil.py: cada `origen` del perfil debe ser real. Datos inventados, sin red ni LLM."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / ".claude" / "skills" / "verificar-trazabilidad" / "scripts" / "verificar_perfil.py"
CV = "ANA PRUEBA\nAnalista de datos en Empresa Uno desde 2020\nPython, SQL\n"


def correr(origen, nivel_origen=None, cv=CV):
    perfil = {"usuaria_id": "ana", "experiencias": [{"cargo": "Analista", "origen": origen}],
              "taxonomia": {"niveles_por_familia": [{"familia": "x", "nivel": "junior", "origen": nivel_origen or origen}]}}
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / "fuentes").mkdir()
        (d / "fuentes" / "cv.txt").write_text(cv, encoding="utf-8")
        (d / "perfil.json").write_text(json.dumps(perfil), encoding="utf-8")
        r = subprocess.run([sys.executable, "-I", str(SCRIPT), str(d)], capture_output=True, text=True, encoding="utf-8")
        return r.returncode, json.loads(r.stdout)


class TestOrigenes(unittest.TestCase):
    def test_origen_real_pasa(self):
        rc, out = correr({"archivo": "cv.txt", "fragmento": "Analista de datos en Empresa Uno", "linea": 2})
        self.assertEqual((rc, out["ok"]), (0, True))

    def test_fragmento_inventado_se_rechaza(self):
        rc, out = correr({"archivo": "cv.txt", "fragmento": "Directora de datos", "linea": 2})
        self.assertEqual(rc, 1)
        self.assertEqual(out["errores"][0]["tipo"], "fragmento_no_esta_en_el_archivo")

    def test_linea_equivocada_se_rechaza(self):
        rc, out = correr({"archivo": "cv.txt", "fragmento": "Python, SQL", "linea": 2})
        self.assertEqual(rc, 1)
        self.assertEqual(out["errores"][0]["tipo"], "fragmento_no_esta_en_esa_linea")

    def test_el_nivel_por_familia_tambien_se_comprueba(self):
        bueno = {"archivo": "cv.txt", "fragmento": "Python, SQL", "linea": 3}
        malo = {"archivo": "cv.txt", "fragmento": "veinte años de experiencia", "linea": 3}
        rc, out = correr(bueno, nivel_origen=malo)
        self.assertEqual(rc, 1)
        self.assertIn("niveles_por_familia", out["errores"][0]["detalle"])

    def test_no_sale_de_la_carpeta_fuentes(self):
        rc, out = correr({"archivo": "../perfil.json", "fragmento": "ana", "linea": 1})
        self.assertEqual(rc, 1)
        self.assertEqual(out["errores"][0]["tipo"], "archivo_de_origen_no_existe")

    def test_la_salida_no_lleva_texto_del_cv(self):
        rc, _ = correr({"archivo": "cv.txt", "fragmento": "Directora secreta", "linea": 2})
        r = subprocess.run([sys.executable, "-I", "-c", "print(1)"], capture_output=True, text=True)
        self.assertEqual(rc, 1)
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "fuentes").mkdir()
            (d / "fuentes" / "cv.txt").write_text(CV, encoding="utf-8")
            (d / "perfil.json").write_text(json.dumps({"experiencias": [{"origen": {"archivo": "cv.txt", "fragmento": "Directora secreta"}}]}), encoding="utf-8")
            salida = subprocess.run([sys.executable, "-I", str(SCRIPT), str(d)], capture_output=True, text=True, encoding="utf-8").stdout
        self.assertNotIn("Directora secreta", salida)


if __name__ == "__main__":
    unittest.main()
