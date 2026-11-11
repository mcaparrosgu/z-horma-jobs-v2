"""Nivel por familia (esquema 0.6): el filtro compara con el nivel de la familia de la oferta. Sin red ni LLM."""
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
BUSCAR = RAIZ / ".claude" / "skills" / "buscar-ofertas" / "scripts" / "buscar.py"
VALIDAR = RAIZ / ".claude" / "skills" / "esquemas-horma" / "scripts" / "validar.py"

spec = importlib.util.spec_from_file_location("buscar", BUSCAR)
buscar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(buscar)

ORIGEN = {"archivo": "a.txt", "fragmento": "x", "linea": 1}
PERFIL = {"taxonomia": {"sectores": [], "familias": [], "nivel": "junior",
                        "niveles_por_familia": [{"familia": "atencion al cliente", "nivel": "senior", "origen": ORIGEN}]}}


def oferta(familia, nivel):
    return {"nivel": nivel, "taxonomia": {"familia": familia}}


class TestNivelPorFamilia(unittest.TestCase):
    def test_usa_el_nivel_de_la_familia_de_la_oferta(self):
        self.assertEqual(buscar.puntos(oferta("atencion al cliente", "senior"), PERFIL), 2)
        self.assertEqual(buscar.puntos(oferta("atencion al cliente", "junior"), PERFIL), 0)

    def test_sin_nivel_propio_usa_el_general(self):
        self.assertEqual(buscar.puntos(oferta("inteligencia artificial", "junior"), PERFIL), 2)
        self.assertEqual(buscar.puntos(oferta("inteligencia artificial", "senior"), PERFIL), 0)

    def test_perfil_antiguo_sin_el_campo_se_comporta_como_antes(self):
        antiguo = {"taxonomia": {"sectores": [], "familias": [], "nivel": "junior"}}
        self.assertEqual(buscar.puntos(oferta("atencion al cliente", "junior"), antiguo), 2)

    def test_datos_raros_no_rompen_el_filtro(self):
        for raro in (None, "senior", [None, "x", 3], [{"familia": None, "nivel": None}], [{"familia": "atencion al cliente", "nivel": None}]):
            perfil = {"taxonomia": {"sectores": [], "familias": [], "nivel": "junior", "niveles_por_familia": raro}}
            # sin nivel propio válido, vale el general (junior)
            self.assertEqual(buscar.puntos(oferta("atencion al cliente", "junior"), perfil), 2)

    def test_el_esquema_acepta_el_campo_y_rechaza_niveles_inventados(self):
        def valida(p):
            base = {"usuaria_id": "x", "experiencias": [], "formacion": [], "skills": [], "idiomas": [],
                    "preguntas_pendientes": [], "taxonomia": p}
            f = Path(self_tmp) / "p.json"
            f.write_text(json.dumps(base), encoding="utf-8")
            r = subprocess.run([sys.executable, "-I", str(VALIDAR), "perfil", str(f)], capture_output=True, text=True, encoding="utf-8")
            return json.loads(r.stdout)["ok"]
        import tempfile
        with tempfile.TemporaryDirectory() as self_tmp:
            self.assertTrue(valida(PERFIL["taxonomia"]))
            malo = {"sectores": [], "familias": [], "nivel": "junior",
                    "niveles_por_familia": [{"familia": "x", "nivel": "genial", "origen": ORIGEN}]}
            self.assertFalse(valida(malo))
            sin_origen = {"sectores": [], "familias": [], "nivel": "junior",
                          "niveles_por_familia": [{"familia": "x", "nivel": "senior"}]}
            self.assertFalse(valida(sin_origen))


if __name__ == "__main__":
    unittest.main()
