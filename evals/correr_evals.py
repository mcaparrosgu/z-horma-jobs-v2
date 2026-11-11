#!/usr/bin/env python3
"""Corre las partes deterministas de los evals de la fase 1 (código, sin LLM).

Uso:
    python -I evals/correr_evals.py [cv|ats|filtro|esquemas|fixtures|carta|ingesta|convertir|verificar_formacion|meses|nivel_familia|origenes_perfil|nivel_empresas|fecha_cierre|casos_raros|analisis_ofertas|todo]

- cv:       sobre evals/cv/base/ aplica las mutaciones de evals/cv/mutaciones.json y exige que
            verificar.py rechace el 100 % de los casos sembrados y acepte el caso «ok».
- ats:      medir_ats.py sobre evals/cv/ats/ contra su esperado.
- filtro:   buscar.py sobre evals/recomendacion/filtro/ contra su esperado.
- esquemas: los JSON de .claude/skills/esquemas-horma/schemas/ son JSON válido.
Lo cualitativo (juez con LLM, extractores, matcher) lo corre el comando /evaluar.
Escribe una ejecución fechada en evals/resultados/ y devuelve 1 si algo falla.
"""
import datetime
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SK = RAIZ / ".claude" / "skills"
PY = [sys.executable, "-I", "-X", "utf8"]  # -I ignora PYTHONIOENCODING: sin -X utf8, un test que falla escribe en cp1252 y rompe la lectura


def correr(script: Path, *args):
    return subprocess.run(PY + [str(script), *map(str, args)], capture_output=True, text=True, encoding="utf-8")


def eval_cv():
    base = RAIZ / "evals" / "cv" / "base"
    casos = json.loads((RAIZ / "evals" / "cv" / "mutaciones.json").read_text(encoding="utf-8"))["casos"]
    verificar = SK / "verificar-trazabilidad" / "scripts" / "verificar.py"
    res = []
    for c in casos:
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp) / "datos" / "candidaturas" / "marta-ejemplo" / "of-1"
            d.mkdir(parents=True)
            cv = (base / "cv.md").read_text(encoding="utf-8")
            traza = (base / "traza.json").read_text(encoding="utf-8")
            for a, b in c["cv"]:
                assert a in cv, f"mutación sin efecto en cv: {a!r}"
                cv = cv.replace(a, b)
            for a, b in c["traza"]:
                assert a in traza, f"mutación sin efecto en traza: {a!r}"
                traza = traza.replace(a, b)
            (d / "cv.md").write_text(cv, encoding="utf-8")
            (d / "traza.json").write_text(traza, encoding="utf-8")
            r = correr(verificar, d, "--maestro", base / "cv-maestro.md", "--perfil", base / "perfil.json")
            salida = json.loads(r.stdout)
            tipos = {e["tipo"] for e in salida["errores"]}
            ok = salida["ok"] if c["esperado"] is None else (not salida["ok"] and c["esperado"] in tipos)
            res.append({"caso": c["nombre"], "ok": ok, "esperado": c["esperado"], "obtenido": sorted(tipos)})
    return res


def eval_ats():
    res = []
    for d in sorted((RAIZ / "evals" / "cv").glob("ats*/")):  # ats, ats-catalan, ats-prefijos: mismo CV base
        with tempfile.TemporaryDirectory() as tmp:
            salida = Path(tmp) / "ats.json"
            correr(SK / "medir-ats" / "scripts" / "medir_ats.py", "--cv", RAIZ / "evals/cv/base/cv.md",
                   "--oferta", d / "oferta.json", "--perfil", RAIZ / "evals/cv/base/perfil.json", "--salida", salida)
            got = json.loads(salida.read_text(encoding="utf-8"))
        exp = json.loads((d / "esperado.json").read_text(encoding="utf-8"))
        ok = (got["cobertura"] == exp["cobertura"] and got["faltantes_con_origen"] == exp["faltantes_con_origen"]
              and got["faltantes_sin_origen"] == exp["faltantes_sin_origen"] and len(got["no_medidos"]) == exp["no_medidos"])
        res.append({"caso": d.name, "ok": ok, "obtenido": {k: got[k] for k in ("cobertura", "faltantes_sin_origen", "no_medidos")}})
    # Caso real: CV adaptado por el redactor para Ana; el inglés B2 está en su CV, cobertura completa.
    ana = RAIZ / "datos" / "fixtures" / "perfiles" / "ana-datos"
    cand = ana / "candidaturas" / "of-prueba-1"
    if cand.exists():
        with tempfile.TemporaryDirectory() as tmp:
            salida = Path(tmp) / "ats.json"
            correr(SK / "medir-ats" / "scripts" / "medir_ats.py", "--cv", cand / "cv.md",
                   "--oferta", RAIZ / "datos/fixtures/ofertas/of-prueba-1.json", "--perfil", ana / "perfil.json", "--salida", salida)
            real = json.loads(salida.read_text(encoding="utf-8"))
        res.append({"caso": "ats real (Ana, of-prueba-1)", "ok": real["cobertura"] == 1.0 and not real["faltantes_sin_origen"],
                    "obtenido": {k: real[k] for k in ("cobertura", "faltantes_sin_origen")}})
    return res


def eval_filtro():
    d = RAIZ / "evals" / "recomendacion" / "filtro"
    r = correr(SK / "buscar-ofertas" / "scripts" / "buscar.py", "--preferencias", d / "preferencias.json",
               "--perfil", RAIZ / "evals/cv/base/perfil.json", "--ofertas", d / "ofertas")
    got = json.loads(r.stdout)
    exp = json.loads((d / "esperado.json").read_text(encoding="utf-8"))
    ok = ([g["id"] for g in got] == exp["orden"]
          and sorted(g["id"] for g in got if g["sin_sueldo"]) == sorted(exp["sin_sueldo"]))
    return [{"caso": "filtro", "ok": ok, "obtenido": [(g["id"], g["puntos_taxonomia"]) for g in got]}]


def eval_fixtures():
    """Las salidas reales de los agentes (fixtures de perfiles) validan contra su esquema."""
    res = []
    validar = SK / "esquemas-horma" / "scripts" / "validar.py"
    for esquema, nombre in (("perfil", "perfil.json"), ("preferencias", "preferencias.json")):
        for f in sorted((RAIZ / "datos" / "fixtures" / "perfiles").glob(f"*/{nombre}")):
            r = correr(validar, esquema, f)
            ok = json.loads(r.stdout)["ok"]
            res.append({"caso": f"{f.parent.name}/{nombre}", "ok": ok, "obtenido": None if ok else json.loads(r.stdout)["errores"]})
    for f in sorted((RAIZ / "datos" / "fixtures" / "ofertas").glob("*.json")):
        r = correr(validar, "oferta", f)
        ok = json.loads(r.stdout)["ok"]
        res.append({"caso": f"ofertas/{f.name}", "ok": ok, "obtenido": None if ok else json.loads(r.stdout)["errores"]})
    # CV generados por agentes: el verificador de código los acepta.
    ana = RAIZ / "datos" / "fixtures" / "perfiles" / "ana-datos"
    verificar = SK / "verificar-trazabilidad" / "scripts" / "verificar.py"
    for carpeta in sorted(list((ana / "cv-base").glob("*")) + list((ana / "candidaturas").glob("*"))):
        r = correr(verificar, carpeta, "--maestro", ana / "cv.md", "--perfil", ana / "perfil.json")
        res.append({"caso": f"verificar {carpeta.relative_to(ana)}", "ok": json.loads(r.stdout)["ok"]})
    # Limitación documentada: el verificador NO caza un cargo inflado; eso es del juez (LLM).
    r = correr(verificar, RAIZ / "evals" / "cv" / "juez", "--maestro", ana / "cv.md", "--perfil", ana / "perfil.json")
    res.append({"caso": "verificar evals/cv/juez (pasa; el juez LLM debe cazar el inflado)", "ok": json.loads(r.stdout)["ok"]})
    return res


def eval_esquemas():
    res = []
    for f in sorted((SK / "esquemas-horma" / "schemas").glob("*.json")):
        try:
            json.loads(f.read_text(encoding="utf-8"))
            res.append({"caso": f.name, "ok": True})
        except json.JSONDecodeError as e:
            res.append({"caso": f.name, "ok": False, "obtenido": str(e)})
    # cv-base.sector repite la lista de sectores de taxonomia-horma: no pueden desincronizarse
    tabla = (SK / "taxonomia-horma" / "SKILL.md").read_text(encoding="utf-8")
    de_taxonomia = set(re.findall(r"^\| `([^`]+)` \|", tabla, re.M))
    cv_base = json.loads((SK / "esquemas-horma" / "schemas" / "cv-base.json").read_text(encoding="utf-8"))
    de_esquema = set(cv_base["properties"]["cv_base"]["items"]["properties"]["sector"]["enum"])
    res.append({"caso": "cv-base.sector = sectores de taxonomia-horma", "ok": de_taxonomia == de_esquema and len(de_taxonomia) > 0,
                "obtenido": str(sorted(de_taxonomia ^ de_esquema))})
    return res


def eval_carta():
    """Cartas: el verificador acepta la limpia, rechaza la sembrada (cifra 40 %) y rechaza
    la primera carta del redactor (fallo conocido que corrige el prompt). Saludo y firma no piden traza."""
    res = []
    ana = RAIZ / "datos" / "fixtures" / "perfiles" / "ana-datos"
    verificar = SK / "verificar-trazabilidad" / "scripts" / "verificar.py"
    def v(carpeta):
        r = correr(verificar, RAIZ / "evals" / "carta" / carpeta, "--carta", "--maestro", ana / "cv.md", "--perfil", ana / "perfil.json")
        return json.loads(r.stdout)
    o = v("limpia")
    res.append({"caso": "carta limpia pasa (saludo y firma sin traza)", "ok": o["ok"], "obtenido": None if o["ok"] else o["errores"]})
    o = v("sembrada")
    tipos = {e["tipo"] for e in o["errores"]}
    res.append({"caso": "carta sembrada: cifra 40 % rechazada", "ok": "cifra_no_esta_en_maestro" in tipos, "obtenido": sorted(tipos)})
    saludos = [e for e in o["errores"] if e["tipo"] == "frase_sin_traza" and e["detalle"].startswith(("Hola equipo", "Un saludo", "Ana Prueba"))]
    res.append({"caso": "carta sembrada: saludo, despedida y firma no se reclaman", "ok": not saludos, "obtenido": saludos or None})
    o = v("redactor")
    tipos = {e["tipo"] for e in o["errores"]}
    res.append({"caso": "carta del redactor (v1) rechazada: frase pegada y cierre sin traza", "ok": tipos == {"frase_de_traza_no_esta_en_cv", "frase_sin_traza"}, "obtenido": sorted(tipos)})
    o = v("redactor-v2")
    res.append({"caso": "carta del redactor (v2) pasa el código (el juez LLM la rechaza por intención inventada)", "ok": o["ok"], "obtenido": None if o["ok"] else o["errores"]})
    o = v("redactor-v3")
    res.append({"caso": "carta del redactor (v3, prompt actual) pasa el código", "ok": o["ok"], "obtenido": None if o["ok"] else o["errores"]})
    return res


def eval_respuestas():
    """Entrevista única, caso de Leo (9-nov): la respuesta dice «participé» y «no decidía el reparto».
    La carta que sale de ahí tiene que pasar el verificador, no puede subir el verbo (lideré, dirigí, coordiné) ni
    atribuir una motivación que nadie dijo, y una traza que cite una respuesta inventada se rechaza.
    Lo cualitativo (que el redactor lo haga solo) se probó con LLM real; esto lo deja repetible sin gasto."""
    import re, shutil, tempfile
    res = []
    fx = RAIZ / "evals" / "respuestas" / "leo-participe"
    verificar = SK / "verificar-trazabilidad" / "scripts" / "verificar.py"
    def v(carpeta):
        r = correr(verificar, carpeta, "--carta", "--maestro", fx / "cv-maestro.md", "--perfil", fx / "perfil.json")
        return json.loads(r.stdout)
    o = v(fx)
    res.append({"caso": "carta de Leo con sus respuestas pasa el verificador", "ok": o["ok"], "obtenido": None if o["ok"] else o["errores"]})
    carta = (fx / "carta.md").read_text(encoding="utf-8")
    prohibidas = re.findall(r"\b(lider\w*|dirig\w*|coordin\w*|gestion\w*)\b", carta, flags=re.I)
    res.append({"caso": "la carta no sube el verbo: «participé» no se vuelve liderar, dirigir, coordinar ni gestionar", "ok": not prohibidas, "obtenido": prohibidas or None})
    motivo = re.findall(r"(me atrae|me motiva|me apasiona|me interesa|me entusiasma|siempre he querido|mi pasión)", carta, flags=re.I)
    res.append({"caso": "sin respuesta de motivación, la carta no atribuye ninguna", "ok": not motivo, "obtenido": motivo or None})
    with tempfile.TemporaryDirectory() as t:
        shutil.copytree(fx, t, dirs_exist_ok=True)
        tr = Path(t) / "traza-carta.json"
        tr.write_text(tr.read_text(encoding="utf-8").replace("Participé en las propuestas y en la entrega de varias de esas identidades junto a otras dos personas del estudio\"", "Dirigí a otras dos personas del estudio en las propuestas\""), encoding="utf-8")
        o = v(Path(t))
    tipos = {e["tipo"] for e in o["errores"]}
    res.append({"caso": "una traza que cita una respuesta que ella no dio se rechaza", "ok": "origen_inexistente" in tipos, "obtenido": sorted(tipos)})
    return res


def eval_ingesta():
    """Seguridad de la descarga (ingestar.py): IP públicas, redirecciones, clave FUENTE_*, límites. Sin red."""
    salida = []
    for archivo, nombre in (("test_ingestar.py", "tests de seguridad de la descarga"),
                            ("test_detectar_ats.py", "tests del detector de ATS")):
        r = subprocess.run(PY + [str(RAIZ / "evals" / "ingesta" / archivo)], capture_output=True, text=True, encoding="utf-8")
        resumen = [l for l in r.stderr.splitlines() if l.startswith(("Ran ", "OK", "FAILED"))]
        salida.append({"caso": nombre + " (" + " · ".join(resumen) + ")", "ok": r.returncode == 0,
                       "obtenido": None if r.returncode == 0 else r.stderr[-1500:]})
    return salida


def eval_convertir():
    """Conversor de CV a texto (HTML): solo texto visible, tope de tamaño. Sin red."""
    r = subprocess.run(PY + [str(RAIZ / "evals" / "convertir" / "test_convertir_cv.py")], capture_output=True, text=True, encoding="utf-8")
    resumen = [l for l in r.stderr.splitlines() if l.startswith(("Ran ", "OK", "FAILED"))]
    return [{"caso": "tests del conversor de CV (" + " · ".join(resumen) + ")", "ok": r.returncode == 0,
             "obtenido": None if r.returncode == 0 else r.stderr[-1500:]}]


def eval_verificar_formacion():
    """Verificador: encabezados de formación con año de fin o con rango; un rango inventado se rechaza."""
    r = subprocess.run(PY + [str(RAIZ / "evals" / "verificar" / "test_formacion.py")], capture_output=True, text=True, encoding="utf-8")
    resumen = [l for l in r.stderr.splitlines() if l.startswith(("Ran ", "OK", "FAILED"))]
    return [{"caso": "tests del verificador, formación (" + " · ".join(resumen) + ")", "ok": r.returncode == 0,
             "obtenido": None if r.returncode == 0 else r.stderr[-1500:]}]


def eval_meses():
    """Verificador con fechas MM/AAAA: valen las del maestro; un mes cambiado, inventado o acortado a solo el año se rechaza."""
    r = subprocess.run(PY + [str(RAIZ / "evals" / "verificar" / "test_meses.py")], capture_output=True, text=True, encoding="utf-8")
    resumen = [l for l in r.stderr.splitlines() if l.startswith(("Ran ", "OK", "FAILED"))]
    return [{"caso": "tests del verificador, meses (" + " · ".join(resumen) + ")", "ok": r.returncode == 0,
             "obtenido": None if r.returncode == 0 else r.stderr[-1500:]}]


def eval_nivel_familia():
    """Esquema 0.6: el filtro usa el nivel de la familia de la oferta (y el general si no hay). Sin red."""
    r = subprocess.run(PY + [str(RAIZ / "evals" / "recomendacion" / "test_nivel_por_familia.py")], capture_output=True, text=True, encoding="utf-8")
    resumen = [l for l in (r.stderr or "").splitlines() if l.startswith(("Ran ", "OK", "FAILED"))]
    return [{"caso": "tests del nivel por familia (" + " · ".join(resumen) + ")", "ok": r.returncode == 0,
             "obtenido": None if r.returncode == 0 else (r.stderr or "")[-1500:]}]


def _unittest(caso, ruta):
    r = subprocess.run(PY + [str(RAIZ / ruta)], capture_output=True, text=True, encoding="utf-8")
    resumen = [l for l in (r.stderr or "").splitlines() if l.startswith(("Ran ", "OK", "FAILED"))]
    return [{"caso": f"{caso} (" + " · ".join(resumen) + ")", "ok": r.returncode == 0,
             "obtenido": None if r.returncode == 0 else (r.stderr or "")[-1500:]}]


def eval_origenes_perfil():
    """Cada `origen` de un perfil.json es real (archivo, fragmento y línea); no sale de fuentes/."""
    return _unittest("tests de los origenes del perfil", "evals/verificar/test_origenes_perfil.py")


def eval_nivel_empresas():
    """Línea roja: niveles_por_familia no aparece en la web fuera de la ficha de candidatas ni en rutas de empresas."""
    return _unittest("el nivel por familia no llega a empresas", "evals/verificar/test_nivel_no_a_empresas.py")


def eval_fecha_cierre():
    """Esquema 0.9: una oferta cerrada no se recomienda y `fecha_cierre` valida (o falta) sin romper nada. Sin red."""
    return _unittest("la oferta cerrada no se recomienda", "evals/recomendacion/test_fecha_cierre.py")


def eval_casos_raros():
    """Casos raros de verificar-trazabilidad, medir-ats y buscar-ofertas (hueco largo, sin experiencia, lista vacía, caducadas…)."""
    return _unittest("casos raros de verificar, medir-ats y buscar", "evals/verificar/test_casos_raros.py")


def eval_analisis_ofertas():
    """Análisis de ofertas en código (clasificar y puntuar): reglas, líneas rojas (avisos, rasgos, respuestas) y esquema. Sin red ni LLM."""
    return _unittest("analisis de ofertas en código", "evals/recomendacion/test_analisis_ofertas.py")


SETS = {"analisis_ofertas": eval_analisis_ofertas, "casos_raros": eval_casos_raros, "fecha_cierre": eval_fecha_cierre, "cv": eval_cv, "ats": eval_ats, "filtro": eval_filtro, "esquemas": eval_esquemas, "fixtures": eval_fixtures, "carta": eval_carta, "respuestas": eval_respuestas, "ingesta": eval_ingesta, "convertir": eval_convertir, "verificar_formacion": eval_verificar_formacion, "meses": eval_meses, "nivel_familia": eval_nivel_familia, "origenes_perfil": eval_origenes_perfil, "nivel_empresas": eval_nivel_empresas}


def main() -> int:
    # En Windows la consola usa cp1252: se fuerza UTF-8 para tildes y eñes.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    pedido = sys.argv[1] if len(sys.argv) > 1 else "todo"
    if pedido != "todo" and pedido not in SETS:
        print(f"Set desconocido: {pedido}. Disponibles: {', '.join(SETS)} o todo.")
        return 2
    nombres = list(SETS) if pedido == "todo" else [pedido]
    todo, fallos = {}, 0
    for n in nombres:
        todo[n] = SETS[n]()
        for x in todo[n]:
            fallos += 0 if x["ok"] else 1
            print(("OK   " if x["ok"] else "FALLA"), n, x["caso"], "" if x["ok"] else x)
    salida = RAIZ / "evals" / "resultados" / f"{datetime.date.today().isoformat()}-codigo.json"
    salida.write_text(json.dumps(todo, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{sum(len(v) for v in todo.values()) - fallos} correctos, {fallos} fallos → {salida.relative_to(RAIZ)}")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
