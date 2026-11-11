// Respuestas del perfil (migración 034) contra la base real, con el rol de la web y dos usuarias INVENTADAS.
// Lo que manda: la web solo toca la columna `respuestas` y solo de SU perfil; el tope de 60 lo impone la base.
// Se salta sola si no hay contraseñas en el entorno.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { SQL_AGREGAR_RESPUESTA, SQL_BORRAR_RESPUESTA, paramsAgregar, paramsBorrar, type Respuesta } from "./respuestas.ts";

const hay = !!(process.env.HORMA_DB_PASSWORD && process.env.HORMA_WEB_PASSWORD);
let dueno: pg.Client;
let web: pg.Client;
const r = (n: number): Respuesta => ({ tema: `Tema ${n}`, texto: `Texto inventado ${n}`, fecha: "2026-11-09" });

/** Una transacción del rol web con la variable de sesión puesta, como hace conUsuaria. */
async function comoWeb<T>(uid: string, f: () => Promise<T>): Promise<T> {
  await web.query("BEGIN");
  try {
    await web.query("SELECT set_config('app.usuaria_id', $1, true)", [uid]);
    const x = await f();
    await web.query("COMMIT");
    return x;
  } catch (e) { await web.query("ROLLBACK"); throw e; }
}
const leer = async (u: string) => (await dueno.query("SELECT respuestas FROM perfiles WHERE usuaria_id = $1", [u])).rows[0].respuestas as Respuesta[];

before(async () => {
  if (!hay) return;
  const base = { host: "127.0.0.1", port: 5433, database: "horma" };
  dueno = new pg.Client({ ...base, user: "horma", password: process.env.HORMA_DB_PASSWORD });
  web = new pg.Client({ ...base, user: "horma_web", password: process.env.HORMA_WEB_PASSWORD });
  await dueno.connect(); await web.connect();
  await dueno.query("DELETE FROM usuarias WHERE id IN ('auto-resp-a','auto-resp-b')");
  for (const u of ["auto-resp-a", "auto-resp-b"]) {
    await dueno.query("INSERT INTO usuarias (id) VALUES ($1)", [u]);
    await dueno.query("INSERT INTO perfiles (usuaria_id, taxonomia) VALUES ($1, '{}'::jsonb)", [u]);
  }
});
after(async () => {
  if (!hay) return;
  await dueno.query("DELETE FROM usuarias WHERE id IN ('auto-resp-a','auto-resp-b')");
  await dueno.end(); await web.end();
});

test("añadir y borrar: solo en su perfil, borrando por valor, y la otra usuaria no se entera", { skip: !hay }, async () => {
  for (const n of [1, 2, 3]) await comoWeb("auto-resp-a", () => web.query(SQL_AGREGAR_RESPUESTA, paramsAgregar("auto-resp-a", r(n))));
  assert.deepEqual((await leer("auto-resp-a")).map((x) => x.tema), ["Tema 1", "Tema 2", "Tema 3"]);
  await comoWeb("auto-resp-a", () => web.query(SQL_BORRAR_RESPUESTA, paramsBorrar("auto-resp-a", r(2))));
  assert.deepEqual((await leer("auto-resp-a")).map((x) => x.tema), ["Tema 1", "Tema 3"]); // orden conservado
  await comoWeb("auto-resp-a", () => web.query(SQL_BORRAR_RESPUESTA, paramsBorrar("auto-resp-a", r(99)))); // no existe: no quita nada
  assert.equal((await leer("auto-resp-a")).length, 2);
  assert.deepEqual(await leer("auto-resp-b"), []);
});

test("borrar una respuesta de varias líneas aunque el navegador la devuelva con \\r\\n (fallo visto con clics, 8-nov)", { skip: !hay }, async () => {
  const multi: Respuesta = { tema: "Varias líneas", texto: "uno\ndos", fecha: "2026-11-09" };
  await comoWeb("auto-resp-a", () => web.query(SQL_AGREGAR_RESPUESTA, paramsAgregar("auto-resp-a", multi)));
  const antes = (await leer("auto-resp-a")).length;
  await comoWeb("auto-resp-a", () => web.query(SQL_BORRAR_RESPUESTA, paramsBorrar("auto-resp-a", { ...multi, texto: "uno\r\ndos" })));
  const despues = await leer("auto-resp-a");
  assert.equal(despues.length, antes - 1);
  assert.ok(!despues.some((x) => x.tema === "Varias líneas"));
});

test("con el id de otra usuaria la base no toca nada (RLS), aunque la consulta se equivoque",{ skip: !hay }, async () => {
  const res = await comoWeb("auto-resp-a", () => web.query(SQL_AGREGAR_RESPUESTA, paramsAgregar("auto-resp-b", r(7))));
  assert.equal(res.rowCount, 0);
  assert.deepEqual(await leer("auto-resp-b"), []);
});

test("la web no puede tocar otras columnas del perfil", { skip: !hay }, async () => {
  await assert.rejects(() => comoWeb("auto-resp-a", () => web.query("UPDATE perfiles SET taxonomia = '{\"x\":1}'::jsonb WHERE usuaria_id = 'auto-resp-a'")), /permission denied/);
});

test("el tope de 60 respuestas lo impone la base", { skip: !hay }, async () => {
  const mas = Array.from({ length: 61 }, (_, i) => r(i));
  await assert.rejects(() => dueno.query("UPDATE perfiles SET respuestas = $1::jsonb WHERE usuaria_id = 'auto-resp-b'", [JSON.stringify(mas)]), (e: { code?: string }) => e.code === "23514");
  await assert.rejects(() => dueno.query("UPDATE perfiles SET respuestas = '{}'::jsonb WHERE usuaria_id = 'auto-resp-b'"), (e: { code?: string }) => e.code === "23514"); // no es lista
});

test("exportar incluye las respuestas y borrar la cuenta se las lleva", { skip: !hay }, async () => {
  const exp = (await dueno.query("SELECT to_jsonb(p) AS dato FROM perfiles p WHERE usuaria_id = 'auto-resp-a'")).rows[0].dato;
  assert.equal(exp.respuestas.length, 2);
  await dueno.query("DELETE FROM usuarias WHERE id = 'auto-resp-a'");
  assert.equal((await dueno.query("SELECT 1 FROM perfiles WHERE usuaria_id = 'auto-resp-a'")).rowCount, 0);
});
