// Pruebas de las piezas puras del importador. Se ejecutan con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL_OFERTA, paramsOferta, paramsPerfil, paramsPreferencias, detalleSeguro } from "./importar.ts";

const FIX = join(process.cwd(), "..", "datos", "fixtures");
const leer = (...ruta: string[]) => JSON.parse(readFileSync(join(FIX, ...ruta), "utf8"));

test("la oferta saca sector, familia y stack de la taxonomía y guarda el JSON como texto", () => {
  const p = paramsOferta(leer("ofertas", "of-prueba-1.json"));
  assert.equal(p.length, 27);
  assert.equal(p[21], null); // sin ejecución → nulo
  assert.equal(p[19], null); // sin origen → licencia nula
  assert.equal(p[20], null);
  assert.equal(p[18], "[]"); // sin avisos en la oferta → lista vacía
  assert.equal(p[0], "of-prueba-1");
  assert.equal(typeof p[14], "string"); // requisitos como texto JSON, no como array de Postgres
  assert.ok(Array.isArray(JSON.parse(p[16] as string)));
});

test("los avisos de la oferta (ciudadanía, habilitación…) se guardan aparte de los requisitos", () => {
  const o = leer("ofertas", "of-prueba-1.json");
  o.avisos = [{ tipo: "ciudadania", texto: "Se exige ciudadanía del país." }];
  const p = paramsOferta(o);
  assert.deepEqual(JSON.parse(p[18] as string), o.avisos);
  assert.ok(!(p[14] as string).includes("ciudadan")); // no se mezclan con los requisitos
});

test("la licencia de origen se guarda en columnas propias", () => {
  const o = leer("ofertas", "of-prueba-1.json");
  o.origen = { licencia: "abierto", atribucion: "Fuente de los datos: Ejemplo" };
  const p = paramsOferta(o);
  assert.equal(p[19], "abierto");
  assert.equal(p[20], "Fuente de los datos: Ejemplo");
});

test("el perfil rellena instrucciones_embebidas si falta", () => {
  const perfil = leer("perfiles", "ana-datos", "perfil.json");
  delete perfil.instrucciones_embebidas;
  assert.equal(paramsPerfil(perfil)[7], "[]");
});

test("las respuestas del perfil entran al crear y nunca se pisan después (manda la web)", () => {
  const perfil = leer("perfiles", "ana-datos", "perfil.json");
  assert.equal(paramsPerfil(perfil)[9], "[]"); // sin el campo: lista vacía
  const r = [{ tema: "Qué valoro", texto: "Equipos pequeños.", fecha: "2026-11-09" }];
  assert.equal(paramsPerfil({ ...perfil, respuestas: r })[9], JSON.stringify(r));
  assert.doesNotMatch(sqlPerfil(true), /respuestas=EXCLUDED/); // ni con --forzar: lo borrado en la web no reaparece
  assert.doesNotMatch(sqlPerfil(false), /respuestas=EXCLUDED/);
});

test("las preferencias toman el id de la carpeta, no del JSON", () => {
  const p = paramsPreferencias("ana-datos", leer("perfiles", "ana-datos", "preferencias.json"));
  assert.equal(p[0], "ana-datos");
  assert.equal(p.length, 12);
});

test("detalleSeguro descarta claves fuera de la lista y valores que no son números", () => {
  const d = detalleSeguro({ archivos: 3, nombre: "Ana García", email: "a@b.c", importadas: "dos", rechazadas: 0 });
  assert.deepEqual(d, { archivos: 3, rechazadas: 0 });
});

// --- Hallazgos del revisor de seguridad (A, B, C, G) ---
import { sqlPerfil, sqlPreferencias, errorSeguro, registrarEvento } from "./importar.ts";
import { problemaClave } from "./clave.ts";

test("A: perfil y preferencias no se pisan salvo con --forzar", () => {
  assert.match(sqlPreferencias(false), /DO NOTHING/);
  assert.match(sqlPreferencias(true), /DO UPDATE/);
  assert.match(sqlPerfil(true), /DO UPDATE SET\s+cv_texto=EXCLUDED.cv_texto,\s+experiencias/);
  // Sin --forzar, el perfil solo rellena cv_texto si estaba vacío y no toca nada más.
  const suave = sqlPerfil(false);
  assert.match(suave, /DO UPDATE SET cv_texto=EXCLUDED.cv_texto WHERE perfiles.cv_texto IS NULL/);
  assert.ok(!/experiencias=EXCLUDED/.test(suave));
});

test("B: errorSeguro no devuelve el mensaje de Postgres (puede traer el valor)", () => {
  const e = Object.assign(new Error('invalid input syntax for type date: "Ana García"'), { code: "22007", constraint: "ofertas_x" });
  const t = errorSeguro(e);
  assert.equal(t, "código 22007, restricción ofertas_x");
  assert.ok(!t.includes("Ana"));
  assert.equal(errorSeguro(new Error("secreto")), "error inesperado");
});

test("C: registrarEvento solo admite componentes y acciones de la lista y limpia la duración", async () => {
  const llamadas: unknown[][] = [];
  const db = { query: async (_s: string, p: unknown[]) => void llamadas.push(p) };
  await registrarEvento(db, { componente: "importador", accion: "importar-datos", resultado: "ok", duracion_ms: -5.7, detalle: { archivos: 2, nombre: "x" } as never });
  assert.deepEqual(llamadas[0], ["importador", "importar-datos", "ok", 0, '{"archivos":2}']);
  await registrarEvento(db, { componente: "importador", accion: "importar-datos", resultado: "ok", duracion_ms: 12.9 });
  assert.equal(llamadas[1][3], 12);
  await assert.rejects(registrarEvento(db, { componente: "Ana García" as never, accion: "importar-datos", resultado: "ok" }));
  await assert.rejects(registrarEvento(db, { componente: "importador", accion: "otra" as never, resultado: "ok" }));
  assert.equal(llamadas.length, 2);
});

test("G: se rechazan contraseñas ausentes, de ejemplo o cortas", () => {
  assert.ok(problemaClave(undefined));
  assert.ok(problemaClave("cambia-esto"));
  assert.ok(problemaClave("corta123"));
  assert.equal(problemaClave("x".repeat(16)), null);
});

test("H: el verificador deja eventos solo con números de la lista cerrada", async () => {
  const llamadas: unknown[][] = [];
  const db = { query: async (_s: string, p: unknown[]) => void llamadas.push(p) };
  await registrarEvento(db, { componente: "verificador", accion: "verificar", resultado: "error", duracion_ms: 40, detalle: { coinciden: 20, fallos: 2, avisos: 1, id: "of-1" } as never });
  assert.deepEqual(llamadas[0], ["verificador", "verificar", "error", 40, '{"coinciden":20,"fallos":2,"avisos":1}']);
});

// --- Candidaturas (bloque 3) ---
import { incoherenciaCandidatura, paramsCandidatura, SQL_CANDIDATURA } from "./importar.ts";

const hist = (...e: [string, string][]) => e.map(([estado, por]) => ({ estado, fecha: "2026-11-06", por }));

test("candidatura: un borrador creado por el agente es coherente", () => {
  assert.equal(incoherenciaCandidatura({ estado: "borrador", historial: hist(["borrador", "agente"]) }), null);
});
test("candidatura: desde archivos NUNCA entra una aprobación ni un envío, ni «firmados» por la usuaria (línea roja)", () => {
  assert.ok(incoherenciaCandidatura({ estado: "aprobada", historial: hist(["borrador", "agente"], ["aprobada", "agente"]) }));
  assert.ok(incoherenciaCandidatura({ estado: "aprobada", historial: hist(["borrador", "agente"], ["aprobada", "usuaria"]) }), "un archivo no puede firmar por ella");
  assert.ok(incoherenciaCandidatura({ estado: "enviada", historial: hist(["borrador", "agente"], ["aprobada", "usuaria"], ["enviada", "usuaria"]) }));
  assert.ok(incoherenciaCandidatura({ estado: "borrador", historial: hist(["aprobada", "usuaria"]) }), "borrador con aprobación");
  assert.equal(incoherenciaCandidatura({ estado: "pendiente_de_ti", historial: hist(["borrador", "agente"]) }), null);
});
test("candidatura: los parámetros siguen el orden del INSERT y los jsonb van como texto", () => {
  const c = { estado: "borrador", cv_usado: "adaptado", historial: [{ estado: "borrador" }], traza: [], huecos: [], ats: { cobertura: 0.5 } };
  const p = paramsCandidatura("ana-prueba", "of-1", c, "# CV", null, null);
  assert.equal(p.length, (SQL_CANDIDATURA.match(/\$\d+/g) ?? []).filter((x, i, a) => a.indexOf(x) === i).length);
  assert.equal(p[5], null); assert.equal(p[8], null);
  assert.equal(typeof p[6], "string"); assert.equal(typeof p[7], "string");
});
import { soloClavesAts, SQL_VERSION_NUEVA, paramsVersionNueva } from "./importar.ts";
test("ats: se descartan las claves de trabajo de medir_ats", () => {
  const a = soloClavesAts({ cobertura: 0.6, faltantes_con_origen: [], faltantes_sin_origen: ["React"], presentes: ["x"], no_medidos: ["y"] });
  assert.deepEqual(Object.keys(a).sort(), ["cobertura", "faltantes_con_origen", "faltantes_sin_origen", "no_medidos"]);
  assert.deepEqual(a.no_medidos, ["y"]);
  assert.equal("presentes" in a, false);
});
test("ats: no_medidos es opcional y se ignora si no es una lista de textos", () => {
  assert.equal("no_medidos" in soloClavesAts({ cobertura: 1, faltantes_con_origen: [], faltantes_sin_origen: [] }), false);
  assert.equal("no_medidos" in soloClavesAts({ cobertura: 1, faltantes_con_origen: [], faltantes_sin_origen: [], no_medidos: [1, { a: 2 }] }), false);
});
test("candidatura: reimportar solo actualiza borradores (no degrada una aprobada o enviada)", () => {
  assert.match(SQL_CANDIDATURA, /WHERE candidaturas\.estado IN \('borrador','pendiente_de_ti'\)/);
});

test("la oferta calcula su URL canónica, su huella y su grupo (A1), y guarda la fecha de cierre", () => {
  const o = leer("ofertas", "of-prueba-1.json");
  o.url = "HTTPS://Ejemplo.es/oferta/1/?utm_source=x";
  o.fecha_cierre = "2026-12-01";
  const p = paramsOferta(o);
  assert.equal(p[22], "https://ejemplo.es/oferta/1");
  assert.match(p[23] as string, /^[0-9a-f]{32}$/);
  assert.match(p[24] as string, /^[0-9a-f]{32}$/);
  assert.equal(p[25], p[24]); // grupo_dedup = huella
  assert.equal(p[26], "2026-12-01");
  assert.equal(paramsOferta(leer("ofertas", "of-prueba-1.json"))[26], null); // sin fecha_cierre → null
});

test("al reimportar, la oferta cuenta una vista más y conserva su primera vista", () => {
  assert.match(SQL_OFERTA, /ultima_vista=now\(\)/);
  assert.match(SQL_OFERTA, /veces_vista=ofertas\.veces_vista \+ 1/);
  assert.ok(!/primera_vista\s*=/.test(SQL_OFERTA), "primera_vista no se pisa al actualizar");
});

test("versión nueva: solo se deja aparte sobre una candidatura APROBADA, sin tocar el texto aprobado", () => {
  assert.match(SQL_VERSION_NUEVA, /estado = 'aprobada'/);
  assert.doesNotMatch(SQL_VERSION_NUEVA, /SET[^W]*(cv_md|carta_md|estado|historial)\s*=/);
  const p = paramsVersionNueva("u", "o", { cv_usado: "adaptado", traza: [], huecos: [], ats: { cobertura: 1 } }, "cv", null, undefined);
  assert.equal(p.length, 3);
  const v = JSON.parse(p[2] as string);
  assert.deepEqual(Object.keys(v).sort(), ["ats", "carta_md", "cv_md", "cv_usado", "huecos", "traza", "traza_carta"]);
  assert.equal(v.traza_carta, null);
});

test("seguridad: ningún GRANT sobre candidaturas.version_nueva (el hueco del disparador depende de ello)", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../../db/migraciones/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    const sinComentarios = readFileSync(new URL(f, dir), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    assert.doesNotMatch(sinComentarios, /GRANT\s+(UPDATE|INSERT|ALL)[^;]*version_nueva/i, f);
  }
});
