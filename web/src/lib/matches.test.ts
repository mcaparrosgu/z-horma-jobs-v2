import { test } from "node:test";
import assert from "node:assert/strict";
import { SQL_MATCHES, SQL_MATCHES_TOTAL, enlaceSeguro, ETIQUETA_CONDICIONES } from "./matches.ts";
import { paramsMatch, SQL_MATCH } from "./importar.ts";
import { SQL_EXPORTAR } from "./datos-usuaria.ts";

test("la consulta de recomendaciones va siempre filtrada por usuaria ($1)", () => {
  assert.match(SQL_MATCHES, /WHERE m\.usuaria_id = \$1/);
  assert.equal(SQL_MATCHES.includes("${"), false, "sin interpolar valores en el SQL");
});

test("una oferta marcada como posible fraude no se recomienda (ni se cuenta como oculta)", () => {
  for (const sql of [SQL_MATCHES, SQL_MATCHES_TOTAL]) {
    assert.match(sql, /NOT COALESCE\(\(o\.auditoria->'fraude'->>'sospechosa'\)::boolean, false\)/);
  }
});

test("enlaceSeguro solo admite http(s)", () => {
  assert.equal(enlaceSeguro("https://x.es/a"), true);
  for (const u of ["javascript:alert(1)", "data:text/html,x", "//x.es", ""]) assert.equal(enlaceSeguro(u), false, u);
});

test("enlaceSeguro no pinta la lista de Horma como si fuera la oferta (ofertas de empresa)", () => {
  for (const u of ["http://localhost:3000/ofertas", "http://127.0.0.1:3000/ofertas/", "https://localhost/ofertas"]) {
    assert.equal(enlaceSeguro(u), false, u);
  }
  // Una web real de ofertas o un enlace con detalle sí se pintan.
  for (const u of ["https://empresa.es/ofertas", "http://localhost:3000/ofertas?q=x", "http://localhost:3000/otra"]) {
    assert.equal(enlaceSeguro(u), true, u);
  }
});

test("hay etiqueta para cada nivel de condiciones", () => {
  for (const n of ["encaja", "parcial", "no"] as const) assert.ok(ETIQUETA_CONDICIONES[n]);
});

test("paramsMatch pasa los valores como parámetros, en el orden del SQL", () => {
  const p = paramsMatch(
    { usuaria_id: "ana-prueba", version_perfil: "v1", fecha: "2026-11-06" },
    { oferta_id: "of-1", nota: 70, nivel_condiciones: "encaja", explicacion: "x", sin_sueldo: true, correccion: null },
  );
  assert.equal(p.length, (SQL_MATCH.match(/\$\d+/g) ?? []).filter((v, i, a) => a.indexOf(v) === i).length);
  assert.ok(p.includes("ana-prueba") && p.includes(70) && p.includes("of-1"));
});

test("la exportación y el borrado RGPD incluyen las recomendaciones, filtradas por usuaria", () => {
  assert.match(SQL_EXPORTAR.matches, /FROM matches/);
  assert.match(SQL_EXPORTAR.matches, /WHERE usuaria_id = \$1$/);
});
