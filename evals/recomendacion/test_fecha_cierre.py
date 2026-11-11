"""Fecha de cierre (esquema 0.9): el filtro no recomienda una oferta ya cerrada. Sin red ni LLM."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
BUSCAR = RAIZ / ".claude" / "skills" / "buscar-ofertas" / "scripts" / "buscar.py"
VALIDAR = RAIZ / ".claude" / "skills" / "esquemas-horma" / "scripts" / "validar.py"
FIX = RAIZ / "datos" / "fixtures" / "ofertas" / "of-prueba-1.json"

spec = importlib.util.spec_from_file_location("buscar", BUSCAR)
buscar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(buscar)


class TestFechaCierre(unittest.TestCase):
    def test_cerrada_no_pasa_y_abierta_si(self):
        self.assertEqual(buscar.pasa_filtro({"fecha_cierre": "2026-11-06"}, {}, "2026-11-07"), (False, False))
        self.assertTrue(buscar.pasa_filtro({"fecha_cierre": "2026-11-07"}, {}, "2026-11-07")[0])  # cierra hoy: aún vale
        self.assertTrue(buscar.pasa_filtro({"fecha_cierre": None}, {}, "2026-11-07")[0])
        self.assertTrue(buscar.pasa_filtro({}, {}, "2026-11-07")[0])  # sin dato no se descarta
        self.assertTrue(buscar.pasa_filtro({"fecha_cierre": "2020-01-01"}, {})[0])  # sin `hoy` la regla no actua

    def test_posible_fraude_no_se_recomienda(self):
        """Orden de Mar (10-nov): lo que la auditoría marca como posible fraude no pasa el filtro; sin marca, sí."""
        fraude = {"auditoria": {"fraude": {"sospechosa": True, "motivos": ["pide dinero"]}}}
        self.assertEqual(buscar.pasa_filtro(fraude, {}), (False, False))
        self.assertTrue(buscar.pasa_filtro({"auditoria": {"fraude": {"sospechosa": False, "motivos": []}}}, {})[0])
        self.assertTrue(buscar.pasa_filtro({"auditoria": {"fraude": {}}}, {})[0])  # sin dato no se descarta
        self.assertTrue(buscar.pasa_filtro({}, {})[0])

    def test_el_esquema_acepta_fecha_cierre_y_sigue_aceptando_sin_ella(self):
        o = json.loads(FIX.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as d:
            for nombre, valor in (("con", "2026-12-01"), ("nula", None)):
                p = Path(d) / f"{nombre}.json"
                p.write_text(json.dumps({**o, "fecha_cierre": valor}), encoding="utf-8")
                r = subprocess.run([sys.executable, "-I", str(VALIDAR), "oferta", str(p)], capture_output=True, text=True, encoding="utf-8")
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            p = Path(d) / "mala.json"
            p.write_text(json.dumps({**o, "fecha_cierre": "01/12/2026"}), encoding="utf-8")
            r = subprocess.run([sys.executable, "-I", str(VALIDAR), "oferta", str(p)], capture_output=True, text=True, encoding="utf-8")
            self.assertNotEqual(r.returncode, 0, "una fecha con formato raro se rechaza")


if __name__ == "__main__":
    unittest.main()
