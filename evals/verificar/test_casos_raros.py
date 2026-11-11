"""Casos raros de lo que ya es código (C2): verificar-trazabilidad, medir-ats y buscar-ofertas.

Sin red ni LLM; solo biblioteca estándar; todos los datos son inventados (Marta Ejemplo y ofertas de ejemplo).
Cada caso se comprobó rompiendo el código a propósito.
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SK = RAIZ / ".claude" / "skills"


def cargar(nombre, ruta):
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


verificar = cargar("verificar", SK / "verificar-trazabilidad" / "scripts" / "verificar.py")
ats = cargar("medir_ats", SK / "medir-ats" / "scripts" / "medir_ats.py")
buscar = cargar("buscar", SK / "buscar-ofertas" / "scripts" / "buscar.py")
BUSCAR = SK / "buscar-ofertas" / "scripts" / "buscar.py"
MEDIR = SK / "medir-ats" / "scripts" / "medir_ats.py"


# ---------------------------------------------------------------- verificar-trazabilidad
MAESTRO_HUECO = """# Marta Ejemplo Prueba (persona inventada)

## Experiencia
### Analista de datos · Distribuciones Ficticias S.L. · 2019–2024
- Automaticé 12 informes mensuales con Python y SQL.

### Auxiliar administrativa · Taller Imaginario S.A. · 2010–2013
- Gestioné la facturación de 40 clientes.

## Formación
### Grado en Estadística · Universidad Ficticia · 2010

## Habilidades
- Python, SQL, Excel
"""
PERFIL_HUECO = {
    "experiencias": [
        {"cargo": "Analista de datos", "empresa": "Distribuciones Ficticias S.L.", "inicio": "2019", "fin": "2024"},
        {"cargo": "Auxiliar administrativa", "empresa": "Taller Imaginario S.A.", "inicio": "2010", "fin": "2013"},
    ],
    "formacion": [{"titulo": "Grado en Estadística", "centro": "Universidad Ficticia", "fin": "2010"}],
}
MAESTRO_SIN_EXP = """# Leo Ejemplo Prueba (persona inventada)

## Formación
### Grado en Diseño · Escuela Ficticia · 2025

## Habilidades
- Figma, Illustrator
"""
PERFIL_SIN_EXP = {"experiencias": [], "formacion": [{"titulo": "Grado en Diseño", "centro": "Escuela Ficticia", "fin": "2025"}]}


def traza_de(cv: str, maestro: str):
    """Una entrada de traza por cada línea con contenido, citando la misma frase del maestro."""
    out = []
    for linea in cv.splitlines():
        s = linea.strip()
        if not s or s.startswith("#"):
            continue
        frase = s.lstrip("-* ").strip()
        out.append({"frase": frase, "origen": {"archivo": "cv-maestro.md", "fragmento": frase, "linea": None}})
    return out


def verifica(cv, maestro, perfil, traza=None, escribir_traza=True, carta=False):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        (t / "c").mkdir()
        (t / "c" / ("carta.md" if carta else "cv.md")).write_text(cv, encoding="utf-8")
        if escribir_traza:
            texto = traza if isinstance(traza, str) else json.dumps(traza_de(cv, maestro) if traza is None else traza)
            (t / "c" / ("traza-carta.json" if carta else "traza.json")).write_text(texto, encoding="utf-8")
        (t / "m.md").write_text(maestro, encoding="utf-8")
        (t / "p.json").write_text(json.dumps(perfil), encoding="utf-8")
        return [e["tipo"] for e in verificar.verificar(t / "c", t / "m.md", t / "p.json", carta)]


class TestVerificarCasosRaros(unittest.TestCase):
    def test_hueco_largo_honesto_pasa(self):
        # 2013 → 2019 sin trabajo: el CV cuenta lo que hubo y deja el hueco como está.
        self.assertEqual(verifica(MAESTRO_HUECO, MAESTRO_HUECO, PERFIL_HUECO), [])

    def test_hueco_tapado_estirando_una_fecha_se_rechaza(self):
        # La fecha de inicio pasa de 2019 a 2013 para que no haya hueco. Ambos años existen en el maestro:
        # lo que lo detecta es el encabezado contra perfil.json, no la búsqueda de fechas.
        cv = MAESTRO_HUECO.replace("· 2019–2024", "· 2013–2024")
        tipos = verifica(cv, MAESTRO_HUECO, PERFIL_HUECO)
        self.assertIn("encabezado_no_coincide_con_perfil", tipos)
        self.assertNotIn("fecha_no_esta_en_maestro", tipos)

    def test_fecha_movida_a_otro_anio_que_existe_en_el_maestro(self):
        cv = MAESTRO_HUECO.replace("Universidad Ficticia · 2010", "Universidad Ficticia · 2013")
        self.assertIn("encabezado_no_coincide_con_perfil", verifica(cv, MAESTRO_HUECO, PERFIL_HUECO))

    def test_fecha_movida_a_un_anio_que_no_existe(self):
        cv = MAESTRO_HUECO.replace("2019–2024", "2018–2024")
        tipos = verifica(cv, MAESTRO_HUECO, PERFIL_HUECO)
        self.assertIn("fecha_no_esta_en_maestro", tipos)
        self.assertIn("encabezado_no_coincide_con_perfil", tipos)

    def test_cargos_intercambiados_entre_empresas(self):
        cv = (MAESTRO_HUECO
              .replace("Analista de datos · Distribuciones", "Auxiliar administrativa · Distribuciones")
              .replace("Auxiliar administrativa · Taller", "Analista de datos · Taller"))
        self.assertIn("encabezado_no_coincide_con_perfil", verifica(cv, MAESTRO_HUECO, PERFIL_HUECO))

    def test_sin_experiencia_pasa_sin_inventar_nada(self):
        self.assertEqual(verifica(MAESTRO_SIN_EXP, MAESTRO_SIN_EXP, PERFIL_SIN_EXP), [])

    def test_sin_experiencia_no_permite_colar_un_puesto(self):
        cv = MAESTRO_SIN_EXP.replace("## Formación", "## Experiencia\n### Becaria de diseño · Estudio Ficticio · 2024\n- Diseñé 3 logotipos.\n\n## Formación")
        tipos = verifica(cv, MAESTRO_SIN_EXP, PERFIL_SIN_EXP)
        self.assertIn("encabezado_no_coincide_con_perfil", tipos)
        self.assertIn("origen_inexistente", tipos)  # la traza automática cita una frase que el maestro no tiene
        self.assertIn("cifra_no_esta_en_maestro", tipos)

    def test_traza_rota_o_ausente_no_se_da_por_buena(self):
        self.assertEqual(verifica(MAESTRO_HUECO, MAESTRO_HUECO, PERFIL_HUECO, traza="{no es json"), ["json_invalido"])
        self.assertEqual(verifica(MAESTRO_HUECO, MAESTRO_HUECO, PERFIL_HUECO, escribir_traza=False), ["falta_archivo"])

    def test_linea_de_origen_cierta_pasa_y_falsa_se_rechaza(self):
        # hallazgo de la pasada del 8-nov: los números de línea de traza.json no coincidían con el maestro
        cv = "Analista de datos con Power BI"
        maestro = "Intro\nAnalista de datos con Power BI\nFin"
        def traza(n):
            return [{"frase": cv, "origen": {"archivo": "cv-maestro.md", "fragmento": cv, "linea": n}}]
        self.assertNotIn("linea_no_coincide", verifica(cv, maestro, PERFIL_HUECO, traza=traza(2)))
        self.assertNotIn("linea_no_coincide", verifica(cv, maestro, PERFIL_HUECO, traza=traza(None)))
        self.assertIn("linea_no_coincide", verifica(cv, maestro, PERFIL_HUECO, traza=traza(1)))
        self.assertIn("linea_no_coincide", verifica(cv, maestro, PERFIL_HUECO, traza=traza(99)))

    def test_respuesta_de_la_usuaria_es_un_origen_valido_solo_si_existe_en_el_perfil(self):
        # entrevista única (9-nov): una traza puede citar una respuesta guardada; no una inventada ni una del maestro
        maestro = "Intro\nAnalista de datos con Power BI\nFin"
        resp = "Me atrae poder explicar datos a personas no técnicas, como hice con 3 equipos."
        perfil = dict(PERFIL_HUECO, respuestas=[{"tema": "motivacion", "texto": resp, "fecha": "2026-11-09"}])
        def traza(frase, frag, archivo="respuesta-usuaria"):
            return [{"frase": frase, "origen": {"archivo": archivo, "fragmento": frag, "linea": None}}]
        self.assertEqual(verifica(resp, maestro, perfil, traza=traza(resp, resp), carta=True), [])
        # un trozo literal también vale; las cifras de la respuesta cuentan como fuente solo en la carta
        self.assertEqual(verifica(resp, maestro, perfil, traza=traza(resp, "explicar datos a personas no técnicas"), carta=True), [])
        self.assertIn("cifra_no_esta_en_maestro", verifica(resp, maestro, perfil, traza=traza(resp, resp)))  # en el CV, no
        # sin la respuesta guardada, el mismo texto no tiene origen (ni cifra)
        tipos = verifica(resp, maestro, dict(PERFIL_HUECO), traza=traza(resp, resp), carta=True)
        self.assertIn("origen_inexistente", tipos)
        self.assertIn("cifra_no_esta_en_maestro", tipos)
        # un fragmento que no está en ninguna respuesta se rechaza, aunque esté en el maestro
        self.assertIn("origen_inexistente", verifica("Analista de datos con Power BI", maestro, perfil, carta=True,
                      traza=traza("Analista de datos con Power BI", "Analista de datos con Power BI")))
        self.assertIn("origen_inexistente", verifica(resp, maestro, perfil, carta=True, traza=traza(resp, "Dirigí un equipo de 50 personas")))
        # un fragmento de una palabra o de una letra no vale como origen
        for corto in ("datos", "a", ""):
            self.assertIn("origen_inexistente", verifica(resp, maestro, perfil, carta=True, traza=traza(resp, corto)))
        # perfil con `respuestas` mal formado o origen que no es objeto: no revienta
        self.assertIn("origen_inexistente", verifica(resp, maestro, dict(PERFIL_HUECO, respuestas=None), carta=True, traza=traza(resp, resp)))
        self.assertIn("origen_inexistente", verifica(resp, maestro, perfil, carta=True, traza=[{"frase": resp, "origen": "mal"}]))

    def test_experiencia_con_fecha_unica_o_sin_ano_pasa_pero_no_se_inventa_otra(self):
        # hallazgo de la pasada con Leo (9-nov): «hace unos años» (inicio = fin) se rechazaba como encabezado
        perfil = dict(PERFIL_HUECO, experiencias=[{
            "cargo": "Colaboraciones varias", "empresa": "Varios", "inicio": "hace unos años", "fin": "hace unos años",
            "origen": {"archivo": "cv.md", "fragmento": "x", "linea": None}}], formacion=[])
        maestro = "### Colaboraciones varias · Varios · hace unos años\n- Trabajos sueltos de ilustración."
        self.assertEqual(verifica(maestro, maestro, perfil), [])
        # una fecha inventada en el encabezado sigue rechazándose
        cv = maestro.replace("hace unos años", "2019")
        self.assertIn("encabezado_no_coincide_con_perfil", verifica(cv, maestro, perfil))

    def test_frase_muy_corta_de_la_traza_no_cubre_una_linea_larga(self):
        # límite anotado el 9-nov: una frase de 8 letras daba por trazada una línea entera que la contenía
        cv = "Analista de datos con Power BI y SQL, además lideré un equipo de ocho personas"
        maestro = cv.replace("lideré", "participé en")  # el maestro no dice «lideré»
        corta = [{"frase": "Power BI", "origen": {"archivo": "cv-maestro.md", "fragmento": "Power BI", "linea": None}}]
        self.assertIn("frase_sin_traza", verifica(cv, maestro, PERFIL_HUECO, traza=corta))
        # la frase completa sí cubre la línea
        entera = [{"frase": cv, "origen": {"archivo": "cv-maestro.md", "fragmento": "Analista de datos con Power BI", "linea": None}}]
        self.assertNotIn("frase_sin_traza", verifica(cv, maestro, PERFIL_HUECO, traza=entera))

    def test_traza_vacia_deja_todas_las_lineas_sin_origen(self):
        tipos = verifica(MAESTRO_HUECO, MAESTRO_HUECO, PERFIL_HUECO, traza=[])
        self.assertIn("frase_sin_traza", tipos)


# ---------------------------------------------------------------- medir-ats
def mide(oferta, cv, perfil):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        (t / "o.json").write_text(json.dumps(oferta), encoding="utf-8")
        (t / "cv.md").write_text(cv, encoding="utf-8")
        (t / "p.json").write_text(json.dumps(perfil), encoding="utf-8")
        r = subprocess.run([sys.executable, "-I", str(MEDIR), "--cv", str(t / "cv.md"), "--oferta", str(t / "o.json"),
                            "--perfil", str(t / "p.json"), "--salida", str(t / "s" / "ats.json")], capture_output=True, text=True, encoding="utf-8")
        assert r.returncode == 0, r.stderr
        return json.loads((t / "s" / "ats.json").read_text(encoding="utf-8"))


class TestMedirAtsCasosRaros(unittest.TestCase):
    def test_oferta_sin_requisitos_ni_stack_no_rompe_y_no_mide_nada(self):
        r = mide({"id": "x"}, "Python", {})
        self.assertEqual((r["presentes"], r["faltantes_con_origen"], r["faltantes_sin_origen"], r["no_medidos"]), ([], [], [], []))
        self.assertEqual(r["cobertura"], 1.0)  # sin claves no hay nada que faltar; la web debe decir «sin requisitos medibles»

    def test_cv_vacio_reparte_las_claves_entre_con_origen_y_sin_origen(self):
        oferta = {"taxonomia": {"stack": ["Python", "Kubernetes"]}, "requisitos": ["SQL"]}
        r = mide(oferta, "", {"skills": ["python", "SQL"]})
        self.assertEqual(r["cobertura"], 0.0)
        self.assertEqual(r["presentes"], [])
        self.assertEqual(sorted(r["faltantes_con_origen"]), ["Python", "SQL"])
        self.assertEqual(r["faltantes_sin_origen"], ["Kubernetes"])  # sin origen: se avisa, nunca se inserta

    def test_clave_de_una_letra_no_casa_dentro_de_otra_palabra(self):
        # «mejor» y «trabajador» terminan en r: sin la comprobación del inicio de palabra, «R» casaría ahí
        r = mide({"taxonomia": {"stack": ["R"]}}, "Proyecto de datos para el mejor trabajador", {"skills": ["R"]})
        self.assertEqual(r["presentes"], [])
        self.assertEqual(r["faltantes_con_origen"], ["R"])

    def test_claves_con_simbolos(self):
        r = mide({"taxonomia": {"stack": ["C++", "C#", "C"]}}, "Programo en C++ y en C#.", {})
        self.assertEqual(r["presentes"], ["C++", "C#"])  # «C» suelta no se da por presente por culpa de «C++»
        self.assertEqual(r["faltantes_sin_origen"], ["C"])

    def test_requisito_repetido_con_y_sin_parentesis_cuenta_una_vez(self):
        r = mide({"requisitos": ["Inglés B2 (se valora)", "Inglés B2", "ingles b2"]}, "Inglés B2", {})
        self.assertEqual(r["presentes"], ["Inglés B2"])
        self.assertEqual(r["cobertura"], 1.0)

    def test_sufijo_o_superior_no_hace_fallar_el_requisito(self):
        # «Inglés B2 o superior» se mide como «Inglés B2»: el CV que dice «Inglés B2» lo cumple
        r = mide({"requisitos": ["Inglés B2 o superior", "SQL o equivalente"]}, "Inglés B2. Trabajo con SQL.", {})
        self.assertEqual(sorted(r["presentes"]), ["Inglés B2 o superior", "SQL o equivalente"])
        self.assertEqual(r["faltantes_sin_origen"], [])
        self.assertEqual(r["cobertura"], 1.0)

    def test_sufijo_o_superior_no_da_por_cumplido_un_nivel_inferior(self):
        # Seguro por defecto: con B1 el requisito «B2 o superior» NO está presente (línea roja: nada de aprobar de más)
        r = mide({"requisitos": ["Inglés B2 o superior"]}, "Inglés B1", {})
        self.assertEqual(r["presentes"], [])
        self.assertEqual(r["faltantes_sin_origen"], ["Inglés B2 o superior"])
        self.assertEqual(r["cobertura"], 0.0)

    def test_requisito_largo_no_se_mide(self):
        r = mide({"requisitos": ["Experiencia liderando equipos grandes de analistas"]}, "", {})
        self.assertEqual(r["no_medidos"], ["Experiencia liderando equipos grandes de analistas"])
        self.assertEqual(r["cobertura"], 1.0)


# ---------------------------------------------------------------- buscar-ofertas
def oferta(**kw):
    base = {"id": "of-x", "pais": "ES", "contrato": "indefinido", "remoto": "hibrido", "idioma": "es", "nivel": "medio",
            "fecha": "2026-11-01", "salario": {"publicado": False, "min": None, "max": None, "moneda": None},
            "taxonomia": {"sector": "datos", "familia": "analisis de datos", "stack": ["Python"]}}
    base.update(kw)
    return base


def corre_buscar(ofertas, prefs=None, perfil=None, hoy="2026-11-07", crudos=None):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        (t / "of").mkdir()
        for o in ofertas:
            (t / "of" / f"{o['id']}.json").write_text(json.dumps(o), encoding="utf-8")
        for nombre, texto in (crudos or {}).items():
            (t / "of" / nombre).write_text(texto, encoding="utf-8")
        (t / "p.json").write_text(json.dumps(prefs or {}), encoding="utf-8")
        (t / "pf.json").write_text(json.dumps(perfil or {}), encoding="utf-8")
        r = subprocess.run([sys.executable, "-I", str(BUSCAR), "--preferencias", str(t / "p.json"), "--perfil", str(t / "pf.json"),
                            "--ofertas", str(t / "of"), "--hoy", hoy], capture_output=True, text=True, encoding="utf-8")
        return r


class TestBuscarCasosRaros(unittest.TestCase):
    def test_lista_vacia_da_lista_vacia(self):
        r = corre_buscar([])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(r.stdout), [])

    def test_sin_salario_no_se_descarta_y_se_marca(self):
        o = oferta(id="of-1")
        del o["salario"]
        r = json.loads(corre_buscar([o], prefs={"sueldo_min": 40000}).stdout)
        self.assertEqual([(x["id"], x["sin_sueldo"]) for x in r], [("of-1", True)])

    def test_salario_publicado_sin_cifras_no_se_descarta(self):
        o = oferta(id="of-1", salario={"publicado": True, "min": None, "max": None, "moneda": "EUR", "periodo": "anual"})
        r = json.loads(corre_buscar([o], prefs={"sueldo_min": 40000}).stdout)
        self.assertEqual([(x["id"], x["sin_sueldo"]) for x in r], [("of-1", False)])

    def test_sueldo_bajo_se_descarta_pero_mensual_no_se_compara_con_el_minimo_anual(self):
        anual = oferta(id="of-a", salario={"publicado": True, "min": 20000, "max": 25000, "moneda": "EUR", "periodo": "anual"})
        mensual = oferta(id="of-m", salario={"publicado": True, "min": 2000, "max": 2500, "moneda": "EUR", "periodo": "mensual"})
        r = json.loads(corre_buscar([anual, mensual], prefs={"sueldo_min": 30000}).stdout)
        self.assertEqual([x["id"] for x in r], ["of-m"])  # 2.500 al mes no es «menos de 30.000»: no se compara lo que no es comparable

    def test_ofertas_caducadas(self):
        ofertas = [oferta(id="of-ayer", fecha_cierre="2026-11-06"), oferta(id="of-hoy", fecha_cierre="2026-11-07"),
                   oferta(id="of-sin", fecha_cierre=None), oferta(id="of-futura", fecha_cierre="2027-01-01")]
        r = json.loads(corre_buscar(ofertas).stdout)
        self.assertEqual(sorted(x["id"] for x in r), ["of-futura", "of-hoy", "of-sin"])

    def test_pais_distinto_se_descarta_y_pais_no_indicado_o_en_minusculas_no(self):
        ofertas = [oferta(id="of-es", pais="es"), oferta(id="of-se", pais="SE"), oferta(id="of-sin", pais=None)]
        r = json.loads(corre_buscar(ofertas, prefs={"paises": ["ES"]}).stdout)
        self.assertEqual(sorted(x["id"] for x in r), ["of-es", "of-sin"])

    def test_sin_preferencias_pasan_todas_y_dato_no_indicado_no_descarta(self):
        ofertas = [oferta(id="of-1", remoto="no_indicado", nivel="no_indicado"), oferta(id="of-2")]
        self.assertEqual(len(json.loads(corre_buscar(ofertas).stdout)), 2)
        prefs = {"remoto": ["remoto"], "niveles": ["senior"]}
        r = json.loads(corre_buscar(ofertas, prefs=prefs).stdout)
        self.assertEqual([x["id"] for x in r], ["of-1"])  # la de datos no indicados sigue; la híbrida de nivel medio cae

    def test_perfil_sin_taxonomia_da_cero_puntos_y_empates_van_por_fecha(self):
        ofertas = [oferta(id="of-vieja", fecha="2026-10-01"), oferta(id="of-nueva", fecha="2026-11-05"), oferta(id="of-sin-fecha", fecha=None)]
        r = json.loads(corre_buscar(ofertas).stdout)
        self.assertEqual([x["puntos_taxonomia"] for x in r], [0, 0, 0])
        self.assertEqual([x["id"] for x in r], ["of-nueva", "of-vieja", "of-sin-fecha"])

    def test_oferta_sin_taxonomia_no_rompe(self):
        o = oferta(id="of-1")
        del o["taxonomia"]
        r = json.loads(corre_buscar([o], prefs={"sectores": ["datos"]}, perfil={"taxonomia": {"sectores": ["datos"]}}).stdout)
        self.assertEqual([(x["id"], x["puntos_taxonomia"]) for x in r], [("of-1", 0)])

    def test_un_archivo_que_no_es_json_falla_en_voz_alta_y_no_se_ignora_en_silencio(self):
        r = corre_buscar([oferta(id="of-1")], crudos={"roto.json": "{no es json"})
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(r.stdout.strip(), "", "no debe imprimir una lista parcial que parezca completa")


if __name__ == "__main__":
    unittest.main()
