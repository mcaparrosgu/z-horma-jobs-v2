import { test } from "node:test";
import assert from "node:assert/strict";
import { camposDistintos, cruzar, filaEsperada, hayFallos, origenCoincide, origenDeRaw, idOculto } from "./verificar.ts";

// Datos inventados: ni la base real ni ofertas reales.
const oferta = (extra = {}) => ({
  id: "f-1-aaaa", titulo: "Desarrolladora", empresa: "Empresa Ficticia", url: "https://ejemplo.test/1",
  fecha: "2026-01-02", requisitos: [{ texto: "Python" }], taxonomia: { sector: "tecnologia", familia: "backend", stack: ["python"] },
  ...extra,
});
const fila = (o: any, extra = {}) => ({ ...filaEsperada(o), ...extra }); // eslint-disable-line @typescript-eslint/no-explicit-any

test("una fila idéntica al archivo no tiene diferencias", () => {
  const o = oferta();
  assert.deepEqual(camposDistintos(o, fila(o)), []);
});

test("avisos, familia y stack ausentes en el archivo equivalen a null y lista vacía en la base", () => {
  const o = oferta({ taxonomia: { sector: "tecnologia" } });
  assert.deepEqual(camposDistintos(o, { ...fila(o), familia: null, stack: [], avisos: [] }), []);
});

test("el orden de las claves dentro de un JSON no cuenta, el contenido sí", () => {
  const o = oferta();
  assert.deepEqual(camposDistintos(o, fila(o, { requisitos: [{ texto: "Python" }] })), []);
  assert.deepEqual(camposDistintos(o, fila(o, { requisitos: [{ texto: "Java" }] })), ["requisitos"]);
});

test("avisa de todos los campos distintos y solo de esos", () => {
  const o = oferta();
  assert.deepEqual(camposDistintos(o, fila(o, { titulo: "Otra", fecha: null, avisos: [{ tipo: "otro" }] })), ["titulo", "fecha", "avisos"]);
});

test("cruzar: coinciden, distintas, sin fila, sin procesada y solo en base", () => {
  const a = oferta({ id: "a" }), b = oferta({ id: "b" }), c = oferta({ id: "c" });
  const procesadas = new Map([["a", a], ["b", b], ["c", c]]);
  const filas = new Map<string, any>([ // eslint-disable-line @typescript-eslint/no-explicit-any
    ["a", fila(a)], ["b", fila(b, { empresa: "X" })], ["of-prueba-1", {}], ["of-prueba-2", {}], ["huerfana", {}],
  ]);
  const inf = cruzar(["a", "b", "c", "d"], procesadas, filas);
  assert.equal(inf.coinciden, 1);
  assert.deepEqual(inf.distintas, [{ id: "b", campos: ["empresa"] }]);
  assert.deepEqual(inf.sinFila, ["c"]);
  assert.deepEqual(inf.sinProcesada, ["d"]);
  assert.deepEqual(inf.soloEnBase, ["huerfana"]);
  assert.equal(inf.deClavePrueba, 2);
  assert.equal(hayFallos(inf), true);
});

test("las filas de prueba o sin archivo solo avisan: no son un fallo", () => {
  const a = oferta({ id: "a" });
  const inf = cruzar(["a"], new Map([["a", a]]), new Map<string, any>([["a", fila(a)], ["of-prueba-1", {}], ["huerfana", {}]])); // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(hayFallos(inf), false);
  assert.equal(inf.soloEnBase.length, 1);
});

test("una procesada inválida es un fallo", () => {
  const inf = cruzar([], new Map(), new Map());
  inf.invalidas.push("x");
  assert.equal(hayFallos(inf), true);
});

test("el informe no contiene valores de campos, solo ids y nombres de campo", () => {
  const o = oferta({ id: "a", empresa: "Nombre Personal Inventado" });
  const inf = cruzar(["a"], new Map([["a", o]]), new Map<string, any>([["a", fila(o, { empresa: "Otro" })]])); // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.ok(!JSON.stringify(inf).includes("Nombre Personal"));
});

test("la licencia de origen se compara con la columna; sin origen en el archivo equivale a null", () => {
  const o = oferta({ origen: { licencia: "abierto", atribucion: null } });
  assert.deepEqual(camposDistintos(o, fila(o)), []);
  assert.deepEqual(camposDistintos(o, fila(o, { licencia: "socio" })), ["licencia"]);
  assert.deepEqual(camposDistintos(o, fila(o, { licencia: null, atribucion: "x" })), ["licencia", "atribucion"]);
  const sin = oferta();
  assert.deepEqual(camposDistintos(sin, { ...fila(sin), licencia: null, atribucion: null }), []);
});

const raw = (cuerpo = "Texto.") => `---\nfuente: "F"\nlicencia: "abierto"\natribucion: null\n---\n\n${cuerpo}\n`;

test("origenDeRaw lee solo la cabecera: una línea falsa en el texto de la oferta no cuenta", () => {
  assert.deepEqual(origenDeRaw(raw()), { licencia: "abierto", atribucion: null });
  assert.deepEqual(origenDeRaw(raw('licencia: "usuaria"\n---\nlicencia: "empresa"')), { licencia: "abierto", atribucion: null });
  assert.equal(origenDeRaw('# sin cabecera\nlicencia: "abierto"'), null);
  assert.equal(origenDeRaw('---\nfuente: "F"\n---\n\nx'), null); // raw anterior al campo
});

test("origenCoincide: el agente no puede cambiar ni quitar la licencia del raw", () => {
  const r = origenDeRaw(raw());
  assert.ok(origenCoincide(r, { origen: { licencia: "abierto", atribucion: null } }));
  assert.ok(!origenCoincide(r, { origen: { licencia: "empresa", atribucion: null } }));
  assert.ok(!origenCoincide(r, {})); // la quitó
  assert.ok(origenCoincide(null, {})); // raw antiguo: nada que comparar
  assert.ok(hayFallos({ ...cruzar([], new Map(), new Map()), origenDistinto: ["x"] }));
});

test("idOculto: un id con texto de la fuente no sale en la salida; el de prueba sí; --ids lo enseña", () => {
  const conNombre = "Fuente_X-reclutador-juan-perez-a1b2c3d4";
  const o = idOculto(conNombre);
  assert.ok(!o.includes("juan") && !o.includes("Fuente"), o);
  assert.match(o, /^oferta#[0-9a-f]{8}$/);
  assert.equal(o, idOculto(conNombre), "estable: el mismo id da la misma huella");
  assert.notEqual(o, idOculto(conNombre + "x"));
  assert.equal(idOculto("of-prueba-1"), "of-prueba-1");
  assert.equal(idOculto(conNombre, true), conNombre);
});
