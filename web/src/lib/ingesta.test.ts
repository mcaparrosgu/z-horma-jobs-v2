// Pruebas del registro de ejecuciones y de las piezas del panel. Datos inventados. Se ejecutan con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fuentesDeEndpoints, paramsSincronizarFuente, paramsCerrarEjecucion, cuentaVacia, anotarRechazo, anotarInterrupcion, MAX_ERRORES } from "./ingesta.ts";
import { anchoBarra, estadoEjecucion, FLUJOS } from "./panel.ts";

const ENDPOINTS = join(process.cwd(), "..", ".claude", "skills", "fuentes-ofertas", "endpoints.json");
const real = () => JSON.parse(readFileSync(ENDPOINTS, "utf8"));

test("endpoints.json real se lee y cada fuente se pasa a parámetros con licencia y adaptador", () => {
  const m = fuentesDeEndpoints(real());
  assert.ok(m.size >= 2);
  for (const f of m.values()) {
    const p = paramsSincronizarFuente(f);
    assert.equal(p.length, 13);
    assert.equal(p[10], f.licencia ?? null);
    assert.equal(typeof p[3], "string"); // parámetros como texto JSON
  }
});

test("un endpoints.json que no cumple el esquema no registra ninguna fuente", () => {
  assert.equal(fuentesDeEndpoints({ fuentes: [{ nombre: "x" }] }).size, 0);
  assert.equal(fuentesDeEndpoints(null).size, 0);
});

test("de la clave de API solo viaja a la base el nombre de la variable", () => {
  const f = { ...[...fuentesDeEndpoints(real()).values()][0], clave_env: "FUENTE_PRUEBA_KEY", clave_en: "cabecera", clave_nombre: "X-Key" };
  assert.equal(paramsSincronizarFuente(f)[5], "FUENTE_PRUEBA_KEY");
});

test("los archivos rechazados suman a descartadas; los errores tienen tope, motivo corto y NUNCA el nombre del archivo", () => {
  const c = cuentaVacia();
  for (let i = 0; i < MAX_ERRORES + 5; i++) anotarRechazo(c, "m".repeat(500));
  assert.equal(c.descartadas, MAX_ERRORES + 5);
  assert.equal(c.errores.length, MAX_ERRORES);
  assert.ok(c.errores.every((e) => e.length <= 80));
  assert.equal(c.errores[0], "archivo nº 1: " + "m".repeat(60));
});

test("cerrar una ejecución guarda los errores como texto JSON", () => {
  const c = cuentaVacia();
  c.entraron = 3;
  anotarRechazo(c, "archivo rechazado");
  const p = paramsCerrarEjecucion(7, c);
  assert.deepEqual(p.slice(0, 3), [7, 3, 1]);
  assert.deepEqual(JSON.parse(p[3] as string), ["archivo nº 1: archivo rechazado"]);
});

test("anchoBarra: proporcional, acotada y sin NaN", () => {
  assert.equal(anchoBarra(5, 10), 50);
  assert.equal(anchoBarra(10, 10), 100);
  assert.equal(anchoBarra(20, 10), 100);
  assert.equal(anchoBarra(0, 10), 0);
  assert.equal(anchoBarra(3, 0), 0);
  assert.equal(anchoBarra(NaN, 10), 0);
});

test("estadoEjecucion distingue las cuatro situaciones", () => {
  const d = new Date();
  assert.equal(estadoEjecucion({ ultima_inicio: null, ultima_fin: null, ultima_errores: null }), "sin ejecutar");
  assert.equal(estadoEjecucion({ ultima_inicio: d, ultima_fin: null, ultima_errores: 0 }), "sin terminar");
  assert.equal(estadoEjecucion({ ultima_inicio: d, ultima_fin: d, ultima_errores: 2 }), "con errores");
  assert.equal(estadoEjecucion({ ultima_inicio: d, ultima_fin: d, ultima_errores: 0 }), "correcta");
});

test("el panel lista los flujos A′ a E con su comando", () => {
  assert.deepEqual(FLUJOS.map((f) => f.letra), ["A′", "A", "B", "C", "D", "E"]);
  assert.ok(FLUJOS.every((f) => f.comando.startsWith("/")));
});

test("una fuente de endpoints.json con clave pegada o variable ajena no se sincroniza", () => {
  const base = [...fuentesDeEndpoints(real()).values()][0];
  const mala = (cambio: object) => fuentesDeEndpoints({ fuentes: [{ ...base, ...cambio }] }).size;
  assert.equal(mala({}), 1);
  assert.equal(mala({ clave_env: "HORMA_DB_PASSWORD", clave_en: "cabecera", clave_nombre: "X-Key" }), 0);
  assert.equal(mala({ cabeceras: { Authorization: "Bearer abc" } }), 0);
  assert.equal(mala({ url: "http://ejemplo.es/api" }), 0);
});

test("una importación interrumpida deja error anotado y el panel no la ve como correcta", () => {
  const c = cuentaVacia();
  anotarInterrupcion(c);
  assert.equal(c.errores.length, 1);
  assert.equal(estadoEjecucion({ ultima_inicio: new Date(), ultima_fin: new Date(), ultima_errores: c.errores.length }), "con errores");
});
