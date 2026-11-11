#!/usr/bin/env python3
"""Tests de la skill analisis-ofertas (clasificar y puntuar en código). Sin red, sin LLM, datos inventados."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / ".claude" / "skills" / "analisis-ofertas" / "scripts" / "analizar.py"
VALIDAR = RAIZ / ".claude" / "skills" / "esquemas-horma" / "scripts" / "validar.py"
spec = importlib.util.spec_from_file_location("analizar", SCRIPT)
az = importlib.util.module_from_spec(spec)
spec.loader.exec_module(az)

ORIGEN = {"archivo": "cv.md", "fragmento": "x", "linea": 1}


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


class Clasificar(unittest.TestCase):
    def test_analista_de_datos(self):
        c = az.clasificar(oferta(requisitos=["SQL", "Power BI", "Python"]))
        self.assertEqual((c["sector"], c["familia"]), ("datos", "analisis de datos"))
        self.assertEqual(sorted(c["stack"]), ["Power BI", "Python", "SQL"])

    def test_titulo_ambiguo_deja_null_y_no_inventa(self):
        c = az.clasificar(oferta(titulo="Persona para nuestro equipo", requisitos=["Ganas de aprender"]))
        self.assertEqual((c["sector"], c["familia"], c["stack"]), (None, None, []))

    def test_empate_entre_familias_no_elige(self):
        c = az.clasificar(oferta(titulo="Frontend y backend developer", requisitos=[]))
        self.assertIsNone(c["familia"])

    def test_no_deduce_el_sector_del_nombre_de_la_empresa(self):
        c = az.clasificar(oferta(titulo="Persona de apoyo", empresa="Logística Total S.A.", requisitos=["Paciencia"]))
        self.assertIsNone(c["sector"])

    def test_los_valores_son_de_la_taxonomia(self):
        tax = (RAIZ / ".claude/skills/taxonomia-horma/SKILL.md").read_text(encoding="utf-8")
        for fam, d in az.REGLAS["familias"].items():
            self.assertIn(f"`{fam}`", tax, fam)
            self.assertIn(f"`{d['sector']}`", tax, d["sector"])

    def test_stack_siglas_cortas_exigen_mayusculas(self):
        self.assertNotIn("Go", az.stack_de(oferta(titulo="Ir a casa", requisitos=["go home"])))

    def test_requisito_prohibido_no_clasifica(self):
        c = az.clasificar(oferta(titulo="Persona", requisitos=["Menor de 30 años", "Joven con ganas"]))
        self.assertIsNone(c["sector"])

    def test_vocabulario_ingles_de_ia_y_golang(self):
        c = az.clasificar(oferta(titulo="GenAI Developer", requisitos=[]))
        self.assertEqual(c["familia"], "inteligencia artificial")
        c = az.clasificar(oferta(titulo="Golang Developer", requisitos=[]))
        self.assertEqual(c["familia"], "desarrollo backend")

    def test_developer_a_secas_no_inventa_familia(self):
        c = az.clasificar(oferta(titulo="Software Developer", requisitos=[]))
        self.assertEqual((c["sector"], c["familia"]), ("desarrollo de software", None))


class Puntuar(unittest.TestCase):
    def test_cubre_todo(self):
        x = az.puntuar(oferta(), perfil(), PREFS, 2026)
        self.assertEqual((x["nota"], x["nivel_condiciones"]), (100, "encaja"))

    def test_falta_una_tecnologia_baja_la_nota_y_se_dice(self):
        x = az.puntuar(oferta(requisitos=["SQL", "Python", "Tableau", "Figma"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 50)
        self.assertIn("Tableau", x["explicacion"])
        self.assertIn("Figma", x["explicacion"])

    def test_se_valora_pesa_la_mitad(self):
        x = az.puntuar(oferta(requisitos=["SQL", "Tableau (se valora)"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 67)  # 1 / (1 + 0.5)

    def test_idioma_con_nivel_menor_es_parcial(self):
        p = perfil(idiomas=[{"idioma": "Inglés", "nivel": "B1", "origen": ORIGEN}])
        x = az.puntuar(oferta(requisitos=["Inglés B2"]), p, PREFS, 2026)
        self.assertEqual(x["nota"], 50)
        self.assertIn("nivel inferior", x["explicacion"])

    def test_anios_de_experiencia(self):
        x = az.puntuar(oferta(requisitos=["3 años de experiencia"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 100)  # 2020-2024 = 4 años
        x = az.puntuar(oferta(requisitos=["10 años de experiencia"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 40)

    def test_anys_en_catalan(self):
        self.assertEqual(az.puntuar(oferta(requisitos=["Experiència 2 anys"]), perfil(), PREFS, 2026)["nota"], 100)
        self.assertEqual(az.puntuar(oferta(requisitos=["Experiència de 10 anys"]), perfil(), PREFS, 2026)["nota"], 40)

    def test_meses_se_miden_con_la_logica_de_anios(self):
        self.assertEqual(az.puntuar(oferta(requisitos=["Experiència 12 mesos"]), perfil(), PREFS, 2026)["nota"], 100)
        self.assertEqual(az.puntuar(oferta(requisitos=["Experiencia 6 meses"]), perfil(), PREFS, 2026)["nota"], 100)
        self.assertEqual(az.puntuar(oferta(requisitos=["60 meses de experiencia"]), perfil(), PREFS, 2026)["nota"], 80)  # 4 años = 48 de 60
        corta = perfil(experiencias=[{"cargo": "Analista de datos", "empresa": "X", "inicio": "2024", "fin": "2024", "descripcion": [], "origen": ORIGEN}])
        self.assertEqual(az.puntuar(oferta(requisitos=["Experiència 12 mesos"]), corta, PREFS, 2026)["nota"], 0)  # años de calendario: 2024-2024 cuenta 0 (límite conocido: 12/2023-01/2024 contaría 12 meses)

    def test_experiencia_sin_tema_se_mide_en_el_puesto_del_titulo(self):
        x = az.puntuar(oferta(titulo="Terapeuta ocupacional (substitució)", requisitos=["Experiència 1 anys"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 0)  # 4 años de analista no son experiencia de terapeuta
        self.assertIn("Terapeuta ocupacional", x["explicacion"])
        self.assertNotIn("substitució", x["explicacion"])
        x = az.puntuar(oferta(titulo="Analista de datos junior", requisitos=["Experiència 2 anys"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 100)

    def test_el_puesto_del_titulo_acaba_antes_de_con_amb_o_guion(self):
        adm = perfil(experiencias=[{"cargo": "Administrativa", "empresa": "X", "inicio": "2016", "fin": "2020", "descripcion": [], "origen": ORIGEN}])
        x = az.puntuar(oferta(titulo="AUXILIAR ADMINISTRATIVO/A CON CATALÁN", requisitos=["Experiència 1 anys"]), adm, PREFS, 2026)
        self.assertEqual(x["nota"], 100)
        self.assertNotIn("CATALÁN", x["explicacion"])
        x = az.puntuar(oferta(titulo="ANALISTA - SANT GUIM DE FREIXENET", requisitos=["Experiència 1 anys"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 100)

    def test_no_es_necesaria_experiencia_cuenta_como_cero(self):
        x = az.puntuar(oferta(titulo="Ingeniero junior", requisitos=["Experiencia: 1 mes. No es necesaria experiencia."]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 100)

    def test_el_parentesis_no_es_el_tema(self):
        adm = perfil(experiencias=[{"cargo": "Administrativa", "empresa": "X", "inicio": "2016", "fin": "2020", "descripcion": [], "origen": ORIGEN}])
        x = az.puntuar(oferta(titulo="AUXILIAR ADMINISTRATIU/IVA", requisitos=["Experiència 1 anys (es valorarà experiència en tasques similars)"]), adm, PREFS, 2026)
        self.assertEqual(x["nota"], 100)

    def test_lloc_similar_es_el_puesto_de_la_oferta(self):
        x = az.puntuar(oferta(requisitos=["Experiència 3 mesos. En lloc similar"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 100)  # título «Analista de datos»: es su cargo

    def test_meses_exactos_si_la_fecha_trae_mes(self):
        def con(inicio, fin):
            return perfil(experiencias=[{"cargo": "Analista de datos", "empresa": "X", "inicio": inicio, "fin": fin, "descripcion": [], "origen": ORIGEN}])
        self.assertEqual(az.puntuar(oferta(requisitos=["Experiència 3 mesos"]), con("03/2024", "05/2024"), PREFS, 2026)["nota"], 67)  # 2 de 3
        self.assertEqual(az.puntuar(oferta(requisitos=["Experiència 12 mesos"]), con("2023-12", "2024-01"), PREFS, 2026)["nota"], 8)  # 1 mes, no 12
        self.assertEqual(az.puntuar(oferta(requisitos=["Experiència 12 mesos"]), con("2023", "2024"), PREFS, 2026)["nota"], 100)  # solo años: como antes

    def test_prohibidas_en_catalan(self):
        for t in ["Edat entre 25 i 40 anys", "Persona jove", "Major de 45 anys", "Sexe: home", "Sense distinció de gènere",
                  "Nacionalitat espanyola", "Estat civil", "Bona salut", "Certificat de discapacitat", "Bona presència", "Personalitat oberta"]:
            self.assertTrue(az.es_prohibido(t), t)
        self.assertFalse(az.es_prohibido("Que genere informes semanales"))  # «genere» castellano no es «gènere»

    def test_titulo_con_rasgo_prohibido_no_se_usa_ni_se_cita(self):
        x = az.puntuar(oferta(titulo="Conserje con certificado de discapacidad", requisitos=["Experiència 1 anys", "SQL"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 100)  # solo cuenta SQL; la experiencia no se mide con ese título
        self.assertNotIn("discapacidad", x["explicacion"])

    def test_texto_hostil_largo_no_cuelga(self):
        import time
        t = time.time()
        az.puntuar(oferta(titulo="(" * 20000, requisitos=["1" + " " * 20000 + "x"]), perfil(), PREFS, 2026)
        self.assertLess(time.time() - t, 0.5)

    def test_idiomas_escritos_en_catalan(self):
        p = perfil(idiomas=[{"idioma": "Español", "nivel": "nativo", "origen": ORIGEN}, {"idioma": "Inglés", "nivel": "B2", "origen": ORIGEN}])
        reqs = ["Català: parlat Superior, escrit Superior", "Anglès B2", "Castellà (espanyol): parlat Superior"]
        x = az.puntuar(oferta(requisitos=reqs), p, PREFS, 2026)
        self.assertEqual(x["nota"], 67)  # falta el catalán; inglés y castellano sí
        self.assertIn("Català", x["explicacion"])

    def test_sin_requisitos_nota_null(self):
        x = az.puntuar(oferta(requisitos=[]), perfil(), PREFS, 2026)
        self.assertIsNone(x["nota"])
        self.assertIn("Sin nota", x["explicacion"])

    def test_sin_nota_con_requisitos_no_dice_que_no_los_trae(self):
        x = az.puntuar(oferta(requisitos=["Ganas de aprender", "Persona organizada"]), perfil(), PREFS, 2026)
        self.assertIsNone(x["nota"])
        self.assertIn("ninguno de los 2 requisitos", x["explicacion"])
        self.assertNotIn("no trae requisitos", x["explicacion"])

    def test_avisos_no_influyen(self):
        a = az.puntuar(oferta(), perfil(), PREFS, 2026)
        b = az.puntuar(oferta(avisos=[{"tipo": "ciudadania", "texto": "Nacionalidad española"}]), perfil(), PREFS, 2026)
        self.assertEqual(a, b)

    def test_requisito_prohibido_se_ignora_y_no_se_cita(self):
        x = az.puntuar(oferta(requisitos=["SQL", "Menor de 30 años", "Buena presencia"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 100)
        for t in ("30", "presencia", "Menor"):
            self.assertNotIn(t, x["explicacion"])

    def test_respuestas_del_perfil_no_puntuan(self):
        p = perfil(respuestas=[{"tema": "herramientas", "texto": "Uso Tableau a diario", "fecha": "2026-11-01"}])
        x = az.puntuar(oferta(requisitos=["Tableau"]), p, PREFS, 2026)
        self.assertEqual(x["nota"], 0)

    def test_una_cualidad_no_medible_no_baja_la_nota(self):
        x = az.puntuar(oferta(requisitos=["SQL", "Ganas de aprender", "Persona organizada"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 100)
        self.assertIn("no se pueden medir", x["explicacion"])

    def test_una_titulacion_que_falta_si_baja_la_nota(self):
        x = az.puntuar(oferta(requisitos=["SQL", "Grado en Enfermería"]), perfil(), PREFS, 2026)
        self.assertEqual(x["nota"], 50)

    def test_condiciones(self):
        self.assertEqual(az.puntuar(oferta(contrato="temporal"), perfil(), PREFS, 2026)["nivel_condiciones"], "parcial")
        self.assertEqual(az.puntuar(oferta(contrato="temporal", remoto="presencial"), perfil(), PREFS, 2026)["nivel_condiciones"], "no")
        # lo que la oferta no dice no penaliza
        self.assertEqual(az.puntuar(oferta(contrato="", remoto="no_indicado", pais=None), perfil(), PREFS, 2026)["nivel_condiciones"], "encaja")

    def test_sueldo_minimo(self):
        p = dict(PREFS, sueldo_min=30000)
        sal = {"publicado": True, "min": 20000, "max": 24000, "moneda": "EUR", "periodo": "anual"}
        x = az.puntuar(oferta(salario=sal), perfil(), p, 2026)
        self.assertEqual((x["nivel_condiciones"], x["sin_sueldo"]), ("parcial", False))

    def test_explicacion_cabe_en_el_esquema(self):
        reqs = [f"Requisito largo número {i} " + "x" * 60 for i in range(80)]
        self.assertLessEqual(len(az.puntuar(oferta(requisitos=reqs), perfil(), PREFS, 2026)["explicacion"]), 1500)


class DeBordeAborde(unittest.TestCase):
    def test_cli_clasificar_y_puntuar_validan_contra_el_esquema(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "ofertas").mkdir()
            (t / "ofertas" / "of-1.json").write_text(json.dumps(oferta(), ensure_ascii=False), encoding="utf-8")
            (t / "perfil.json").write_text(json.dumps(perfil(), ensure_ascii=False), encoding="utf-8")
            (t / "prefs.json").write_text(json.dumps(PREFS, ensure_ascii=False), encoding="utf-8")
            (t / "orden.json").write_text(json.dumps([{"id": "of-1", "puntos_taxonomia": 0, "sin_sueldo": True, "fecha": None}]), encoding="utf-8")
            r = subprocess.run([sys.executable, "-I", str(SCRIPT), "clasificar", "--ofertas", str(t / "ofertas")], capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(r.returncode, 0, r.stderr)
            o = json.loads((t / "ofertas" / "of-1.json").read_text(encoding="utf-8"))
            self.assertEqual(o["taxonomia"]["familia"], "analisis de datos")
            r = subprocess.run([sys.executable, "-I", str(VALIDAR), "oferta", str(t / "ofertas" / "of-1.json")], capture_output=True, text=True, encoding="utf-8")
            self.assertTrue(json.loads(r.stdout)["ok"], r.stdout)
            # una corrección previa de la usuaria sobrevive al recalcular
            m = t / "matches"
            m.mkdir()
            (m / "2026-11-01.json").write_text(json.dumps({"usuaria_id": "ana-prueba", "version_perfil": "x", "fecha": "2026-11-01", "ofertas": [
                {"oferta_id": "of-1", "nota": 10, "nivel_condiciones": "no", "explicacion": "vieja", "correccion": "Sí tengo Python"}]}), encoding="utf-8")
            (m / "orden.json").write_text("[]", encoding="utf-8")  # vive en la misma carpeta que los matches
            salida = m / "2026-11-10.json"
            r = subprocess.run([sys.executable, "-I", str(SCRIPT), "puntuar", "--perfil", str(t / "perfil.json"), "--preferencias", str(t / "prefs.json"),
                                "--ofertas", str(t / "ofertas"), "--orden", str(t / "orden.json"), "--salida", str(salida), "--fecha", "2026-11-10"],
                               capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(r.returncode, 0, r.stderr)
            r = subprocess.run([sys.executable, "-I", str(VALIDAR), "match", str(salida)], capture_output=True, text=True, encoding="utf-8")
            self.assertTrue(json.loads(r.stdout)["ok"], r.stdout)
            self.assertEqual(json.loads(salida.read_text(encoding="utf-8"))["ofertas"][0]["correccion"], "Sí tengo Python")

    def test_archivos_que_no_son_ofertas_se_saltan_sin_tocarlos(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "of-1.json").write_text(json.dumps(oferta(), ensure_ascii=False), encoding="utf-8")
            ajeno = json.dumps({"usuaria_id": "ana-prueba", "ofertas": []})
            (t / "match.json").write_text(ajeno, encoding="utf-8")
            (t / "roto.json").write_text("{no es json", encoding="utf-8")
            r = subprocess.run([sys.executable, "-I", str(SCRIPT), "clasificar", "--ofertas", str(t)], capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(json.loads(r.stdout), {"revisadas": 1, "cambiadas": 1})
            self.assertIn("2 archivo(s) que no son ofertas", r.stderr)
            self.assertEqual((t / "match.json").read_text(encoding="utf-8"), ajeno)
            self.assertEqual([f.name for f, _ in az.leer_ofertas(t)], ["of-1.json"])

    def test_el_archivo_dorado_esta_al_dia(self):
        """golden-analisis.json es el contrato de la versión TypeScript: si cambian las reglas, se regenera a propósito."""
        r = subprocess.run([sys.executable, "-I", str(RAIZ / "evals/recomendacion/golden_analisis.py")], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_rango_invalido_para(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            for n in ("perfil", "prefs", "orden"):
                (t / f"{n}.json").write_text("[]" if n == "orden" else "{}", encoding="utf-8")
            r = subprocess.run([sys.executable, "-I", str(SCRIPT), "puntuar", "--perfil", str(t / "perfil.json"), "--preferencias", str(t / "prefs.json"),
                                "--ofertas", str(t), "--orden", str(t / "orden.json"), "--salida", str(t / "s.json"), "--rango", "60;rm"],
                               capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
