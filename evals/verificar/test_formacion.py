"""Tests del verificador: encabezados de formación con año de fin o con rango. Sin red ni LLM."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / ".claude" / "skills" / "verificar-trazabilidad" / "scripts" / "verificar.py"
MAESTRO = "# Ana\n### Grado X · UOC · 2012–2019\n- Cursado online\n"
PERFIL = {"experiencias": [], "formacion": [{"titulo": "Grado X", "centro": "UOC", "inicio": "2012", "fin": "2019"}]}


def correr(encabezado):
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / "cv.md").write_text("# Ana\n" + encabezado + "\n- Cursado online\n", encoding="utf-8")
        traza = [{"frase": "Cursado online", "origen": {"archivo": "cv-maestro.md", "fragmento": "Cursado online"}}]
        (d / "traza.json").write_text(json.dumps(traza), encoding="utf-8")
        (d / "m.md").write_text(MAESTRO, encoding="utf-8")
        (d / "p.json").write_text(json.dumps(PERFIL), encoding="utf-8")
        r = subprocess.run([sys.executable, "-I", str(SCRIPT), str(d), "--maestro", str(d / "m.md"), "--perfil", str(d / "p.json")],
                           capture_output=True, text=True, encoding="utf-8")
        return r.returncode, r.stdout


class TestFormacion(unittest.TestCase):
    def test_rango_completo_vale(self):
        self.assertEqual(correr("### Grado X · UOC · 2012–2019")[0], 0)

    def test_solo_ano_de_fin_ya_no_vale(self):
        # El encabezado debe ser el del maestro: ocultar el año de inicio contradice la regla de los huecos.
        rc, out = correr("### Grado X · UOC · 2019")
        self.assertEqual(rc, 1)
        self.assertIn("encabezado_no_esta_en_maestro", out)

    def test_perfil_mal_copiado_se_caza_con_el_maestro(self):
        # Si el perfil trae una fecha distinta de la del maestro, el encabezado del perfil no basta.
        global PERFIL
        original = PERFIL
        PERFIL = {"experiencias": [], "formacion": [{"titulo": "Grado X", "centro": "UOC", "inicio": "2010", "fin": "2019"}]}
        try:
            rc, out = correr("### Grado X · UOC · 2010–2019")
        finally:
            PERFIL = original
        self.assertEqual(rc, 1)
        self.assertIn("encabezado_no_esta_en_maestro", out)

    def test_rango_inventado_se_rechaza(self):
        rc, out = correr("### Grado X · UOC · 2010–2019")
        self.assertEqual(rc, 1)
        self.assertIn("encabezado_no_coincide_con_perfil", out)


if __name__ == "__main__":
    unittest.main()
