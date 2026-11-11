#!/usr/bin/env python3
"""Tests deterministas de detectar_ats.py. Sin red.

Uso:  python -I evals/ingesta/test_detectar_ats.py
"""
import importlib.util
import unittest
from pathlib import Path
from unittest import mock

RAIZ = Path(__file__).resolve().parents[2]
RUTA = RAIZ / ".claude" / "skills" / "fuentes-ofertas" / "scripts" / "detectar_ats.py"
spec = importlib.util.spec_from_file_location("detectar_ats", RUTA)
da = importlib.util.module_from_spec(spec)
spec.loader.exec_module(da)


class Detectar(unittest.TestCase):
    def test_cada_ats(self):
        casos = {
            "greenhouse": ('<a href="https://boards.greenhouse.io/acme">Ofertas</a>', "acme"),
            "lever": ('<a href="https://jobs.lever.co/acme-sl">x</a>', "acme-sl"),
            "ashby": ('<iframe src="https://jobs.ashbyhq.com/acme"></iframe>', "acme"),
            "recruitee": ('<a href="https://acme.recruitee.com/">x</a>', "acme"),
            "teamtailor": ('<a href="https://acme.teamtailor.com/jobs">x</a>', "acme"),
            "workable": ('<a href="https://apply.workable.com/acme/">x</a>', "acme"),
            "personio": ('<a href="https://acme.jobs.personio.de/">x</a>', "acme"),
            "smartrecruiters": ('<a href="https://jobs.smartrecruiters.com/Acme">x</a>', "Acme"),
        }
        for ats, (html, slug) in casos.items():
            with self.subTest(ats=ats):
                r = da.detectar(html, "https://acme.es/empleo")
                self.assertEqual((r["ats"], r["slug"]), (ats, slug))

    def test_sin_ats(self):
        self.assertIsNone(da.detectar('<a href="/contacto">c</a><a href="https://acme.es/empleo/1">x</a>', "https://acme.es"))

    def test_slug_generico_no_cuenta(self):
        self.assertIsNone(da.detectar('<a href="https://www.recruitee.com/">Recruitee</a>', "https://acme.es"))

    def test_enlace_relativo_resuelto(self):
        r = da.detectar('<a href="//jobs.lever.co/acme">x</a>', "https://acme.es/empleo")
        self.assertEqual(r["ats"], "lever")

    def test_endpoint_es_solo_texto(self):
        r = da.detectar('<a href="https://jobs.lever.co/acme">x</a>', "https://acme.es")
        self.assertEqual(r["endpoint_publico"], "https://api.lever.co/v0/postings/acme?mode=json")


class Seguridad(unittest.TestCase):
    def test_simulacro_no_visita(self):
        with mock.patch.object(da, "visitar") as v, mock.patch.object(da, "_url_publica_https", return_value=True):
            r = da.procesar([{"empresa": "A", "url_empleo": "https://a.es/empleo"}], ejecutar=False)
        v.assert_not_called()
        self.assertEqual(r[0]["estado"], "simulacro")

    def test_http_y_privadas_rechazadas(self):
        for url in ("http://a.es/x", "https://127.0.0.1/x", "ftp://a.es", "https://localhost/x"):
            with self.subTest(url=url):
                self.assertFalse(da._url_publica_https(url))

    def test_robots_bloquea(self):
        with mock.patch.object(da, "_url_publica_https", return_value=True), \
             mock.patch.object(da, "_robots_permite", return_value=False), \
             mock.patch.object(da, "visitar") as v:
            r = da.procesar([{"empresa": "A", "url_empleo": "https://a.es/empleo"}], ejecutar=True)
        v.assert_not_called()
        self.assertEqual(r[0]["estado"], "bloqueado_por_robots")

    def test_una_visita_por_empresa_y_pausa(self):
        filas = [{"empresa": "A", "url_empleo": "https://a.es/e"}, {"empresa": "B", "url_empleo": "https://b.es/e"}]
        with mock.patch.object(da, "_url_publica_https", return_value=True), \
             mock.patch.object(da, "_robots_permite", return_value=True), \
             mock.patch.object(da, "visitar", return_value='<a href="https://jobs.lever.co/x">x</a>') as v, \
             mock.patch.object(da.time, "sleep") as s:
            r = da.procesar(filas, ejecutar=True)
        self.assertEqual(v.call_count, 2)
        self.assertEqual(s.call_count, 1)  # pausa entre empresas, no tras la última
        self.assertTrue(all(x["estado"] == "detectado" for x in r))


if __name__ == "__main__":
    unittest.main()
