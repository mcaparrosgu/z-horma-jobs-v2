"""Tests del verificador con fechas MM/AAAA: se aceptan las del maestro y se rechaza un mes cambiado o inventado. Sin red ni LLM."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / ".claude" / "skills" / "verificar-trazabilidad" / "scripts" / "verificar.py"
MAESTRO = "# Ana\n### Analista · Empresa X · 06/2020–10/2024\n- Hice informes\n### Grado Y · UOC · 06/2016\n- Cursado online\n"
PERFIL = {"experiencias": [{"cargo": "Analista", "empresa": "Empresa X", "inicio": "06/2020", "fin": "10/2024"}],
          "formacion": [{"titulo": "Grado Y", "centro": "UOC", "fin": "06/2016"}]}


def correr(cv):
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / "cv.md").write_text(cv, encoding="utf-8")
        traza = [{"frase": f, "origen": {"archivo": "cv-maestro.md", "fragmento": f}} for f in ("Hice informes", "Cursado online")]
        (d / "traza.json").write_text(json.dumps(traza), encoding="utf-8")
        (d / "m.md").write_text(MAESTRO, encoding="utf-8")
        (d / "p.json").write_text(json.dumps(PERFIL), encoding="utf-8")
        r = subprocess.run([sys.executable, "-I", str(SCRIPT), str(d), "--maestro", str(d / "m.md"), "--perfil", str(d / "p.json")],
                           capture_output=True, text=True, encoding="utf-8")
        return r.returncode


def cv(exp="06/2020–10/2024", grado="06/2016"):
    return f"# Ana\n### Analista · Empresa X · {exp}\n- Hice informes\n### Grado Y · UOC · {grado}\n- Cursado online\n"


class TestMeses(unittest.TestCase):
    def test_meses_del_maestro_valen(self):
        self.assertEqual(correr(cv()), 0)

    def test_mes_cambiado_se_rechaza(self):
        self.assertNotEqual(correr(cv(exp="07/2020–10/2024")), 0)

    def test_mes_inventado_en_la_formacion_se_rechaza(self):
        self.assertNotEqual(correr(cv(grado="09/2016")), 0)

    def test_acortar_a_solo_el_anio_se_rechaza(self):
        self.assertNotEqual(correr(cv(exp="2020–2024")), 0)


if __name__ == "__main__":
    unittest.main()
