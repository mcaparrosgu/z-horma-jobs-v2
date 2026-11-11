// Seguridad por filas (RLS, A3) contra la base real, con el rol de la web (`horma_web`) y dos usuarias INVENTADAS
// (`auto-a`, `auto-b`) y dos empresas inventadas. Se salta sola si no hay contraseñas en el entorno.
// El test que manda: aunque una consulta se equivoque de usuaria_id, la base NO entrega ni toca filas ajenas.
// Incluye la prueba de la prueba: se rompe una política a propósito (dentro de una transacción que se deshace) y la
// comprobación tiene que encontrar la fuga.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { db, conUsuaria, conEmpresa } from "./db.ts";
import {
  SQL_OFERTA, paramsOferta, SQL_USUARIA, SQL_MATCH, paramsMatch, SQL_CANDIDATURA, paramsCandidatura, sqlPreferencias, paramsPreferencias,
} from "./importar.ts";

const hay = !!(process.env.HORMA_DB_PASSWORD && process.env.HORMA_WEB_PASSWORD);
let dueno: pg.Client;
let web: pg.Client;

const conUsuariaId = ["perfiles", "preferencias", "matches", "candidaturas", "envios_empresa"] as const;

const oferta = (id: string) => ({
  id, fuente: "auto-fuente", url: `https://auto.example/${id}`, fecha: null, titulo: `Puesto ${id}`, empresa: "Auto Acme", ubicacion: "Madrid",
  remoto: "presencial", contrato: "indefinido", idioma: "es", nivel: "medio", requisitos: [], avisos: [],
  salario: { publicado: false, min: null, max: null, moneda: null }, taxonomia: { sector: null, familia: null, stack: [] }, auditoria: {},
});

async function limpiar() {
  await dueno.query("DELETE FROM usuarias WHERE id IN ('auto-a','auto-b')"); // borra en cascada sus filas
  await dueno.query("DELETE FROM empresas WHERE id LIKE 'auto-rls-%'");
  await dueno.query("DELETE FROM ofertas WHERE id LIKE 'auto-rls-%'");
}

before(async () => {
  if (!hay) return;
  const base = { host: "127.0.0.1", port: 5433, database: "horma" };
  dueno = new pg.Client({ ...base, user: "horma", password: process.env.HORMA_DB_PASSWORD });
  web = new pg.Client({ ...base, user: "horma_web", password: process.env.HORMA_WEB_PASSWORD });
  await dueno.connect();
  await web.connect();
  // B4-5: el disparador exige oferta y candidatura aprobadas y salta ANTES que la política RLS; este test comprueba permisos
  // (RLS), no esa regla (cubierta en la migración 030), así que se desactiva mientras dura y se reactiva en `after`.
  await dueno.query("ALTER TABLE envios_empresa DISABLE TRIGGER envios_empresa_comprobar");
  await limpiar();
  for (const o of ["auto-rls-o1", "auto-rls-o2"]) await dueno.query(SQL_OFERTA, paramsOferta(oferta(o)));
  await dueno.query("INSERT INTO empresas (id, nombre) VALUES ('auto-rls-e1','Auto Empresa 1'), ('auto-rls-e2','Auto Empresa 2')");
  for (const [u, o, e] of [["auto-a", "auto-rls-o1", "auto-rls-e1"], ["auto-b", "auto-rls-o2", "auto-rls-e2"]]) {
    await dueno.query(SQL_USUARIA, [u]);
    await dueno.query("INSERT INTO perfiles (usuaria_id, taxonomia) VALUES ($1, '{}'::jsonb)", [u]);
    await dueno.query(sqlPreferencias(false), paramsPreferencias(u, { rango_compatibilidad: [0, 100] }));
    await dueno.query(SQL_MATCH, paramsMatch({ usuaria_id: u, version_perfil: "v1", fecha: "2026-11-07" }, { oferta_id: o, nota: 50, nivel_condiciones: "encaja", explicacion: "Prueba inventada." }));
    await dueno.query(SQL_CANDIDATURA, paramsCandidatura(u, o, { estado: "borrador", cv_usado: "adaptado", historial: [], traza: [], huecos: [], ats: {} }, "CV inventado", null, null));
    // B4-6: el envío solo puede apuntar a la empresa dueña de la oferta (clave compuesta): la oferta pasa a ser de su empresa.
    await dueno.query("UPDATE ofertas SET empresa_id = $2 WHERE id = $1", [o, e]);
    await dueno.query("INSERT INTO envios_empresa (usuaria_id, oferta_id, empresa_id, cv_md) VALUES ($1,$2,$3,'CV inventado')", [u, o, e]);
  }
});

after(async () => {
  if (!hay) return;
  await limpiar();
  await dueno.query("ALTER TABLE envios_empresa ENABLE TRIGGER envios_empresa_comprobar");
  await dueno.end();
  await web.end();
  await db().end();
});

const fijar = (c: pg.Client, usuaria: string, empresa = "") =>
  c.query("SELECT set_config('app.usuaria_id', $1, true), set_config('app.empresa_id', $2, true)", [usuaria, empresa]);
const n = async (c: pg.Client, sql: string) => Number((await c.query(sql)).rows[0].n);

/** Dentro de una transacción ya abierta, con el rol de la web: devuelve las FUGAS que encuentra (lista vacía = todo bien). */
async function fugas(c: pg.Client): Promise<string[]> {
  const f: string[] = [];
  // 1) Como `auto-a`: ve lo suyo (control positivo) y nada de `auto-b`; no puede actualizar lo ajeno.
  await fijar(c, "auto-a");
  for (const t of conUsuariaId) {
    if ((await n(c, `SELECT count(*) AS n FROM ${t} WHERE usuaria_id = 'auto-a'`)) !== 1) f.push(`${t}: no ve lo suyo`);
    if ((await n(c, `SELECT count(*) AS n FROM ${t} WHERE usuaria_id = 'auto-b'`)) !== 0) f.push(`${t}: LEE filas de otra usuaria`);
  }
  const actualizar: Record<string, string> = {
    preferencias: "UPDATE preferencias SET sueldo_min = 1 WHERE usuaria_id = 'auto-b'",
    candidaturas: "UPDATE candidaturas SET estado = estado WHERE usuaria_id = 'auto-b'",
    envios_empresa: "UPDATE envios_empresa SET estado_bandeja = estado_bandeja WHERE usuaria_id = 'auto-b'",
  };
  for (const [t, sql] of Object.entries(actualizar)) {
    await c.query("SAVEPOINT upd");
    try {
      if ((await c.query(sql)).rowCount !== 0) f.push(`${t}: ACTUALIZA filas de otra usuaria`);
    } catch (e) {
      if ((e as { code?: string }).code !== "42501") f.push(`${t}: el update falló por otro motivo (${(e as { code?: string }).code})`);
    }
    await c.query("ROLLBACK TO SAVEPOINT upd");
  }
  // 2) Insertar una fila con el usuaria_id de otra falla (42501 = política de seguridad por filas).
  for (const [t, sql, params] of [
    // Con DO UPDATE: sin RLS esto pisaría la fila de `auto-b` (rowCount 1); con RLS la política lo rechaza antes (42501).
    ["preferencias", sqlPreferencias(true), paramsPreferencias("auto-b", { rango_compatibilidad: [0, 100] })],
    ["envios_empresa", "INSERT INTO envios_empresa (usuaria_id, oferta_id, empresa_id, cv_md) VALUES ('auto-b','auto-rls-o1','auto-rls-e1','x')", []],
  ] as [string, string, unknown[]][]) {
    await c.query("SAVEPOINT ins");
    try {
      const r = await c.query(sql, params);
      if (t === "envios_empresa" || (r.rowCount ?? 0) > 0) f.push(`${t}: INSERTA una fila a nombre de otra usuaria`);
    } catch (e) {
      if ((e as { code?: string }).code !== "42501") f.push(`${t}: el insert falló por otro motivo (${(e as { code?: string }).code})`);
    }
    await c.query("ROLLBACK TO SAVEPOINT ins");
  }
  // 3) Sin la variable no se ve nada (falla cerrado).
  await fijar(c, "");
  for (const t of conUsuariaId) {
    if ((await n(c, `SELECT count(*) AS n FROM ${t} WHERE usuaria_id LIKE 'auto-%'`)) !== 0) f.push(`${t}: sin variable SIGUE entregando filas`);
  }
  // 4) Una empresa solo ve lo que le han enviado: nada de perfiles, preferencias, matches ni candidaturas, y no toca envíos ajenos.
  await fijar(c, "", "auto-rls-e1");
  if ((await n(c, "SELECT count(*) AS n FROM envios_empresa WHERE empresa_id = 'auto-rls-e1'")) !== 1) f.push("envios_empresa: la empresa no ve lo suyo");
  if ((await n(c, "SELECT count(*) AS n FROM envios_empresa WHERE empresa_id = 'auto-rls-e2'")) !== 0) f.push("envios_empresa: la empresa LEE envíos de otra");
  if ((await c.query("UPDATE envios_empresa SET estado_bandeja = 'vista' WHERE empresa_id = 'auto-rls-e2'")).rowCount !== 0) f.push("envios_empresa: la empresa ACTUALIZA envíos de otra");
  for (const t of ["perfiles", "preferencias", "matches", "candidaturas"]) {
    if ((await n(c, `SELECT count(*) AS n FROM ${t} WHERE usuaria_id LIKE 'auto-%'`)) !== 0) f.push(`${t}: la empresa VE datos de candidatas`);
  }
  // 4 bis) Endurecimiento 025: la empresa no borra ni inserta envíos; la candidata no toca el estado de la bandeja.
  if ((await c.query("DELETE FROM envios_empresa WHERE empresa_id = 'auto-rls-e1'")).rowCount !== 0) f.push("envios_empresa: la empresa BORRA envíos");
  await c.query("SAVEPOINT emp_ins");
  try {
    await c.query("INSERT INTO envios_empresa (usuaria_id, oferta_id, empresa_id, cv_md) VALUES ('auto-b','auto-rls-o1','auto-rls-e1','x')");
    f.push("envios_empresa: la empresa INSERTA envíos");
  } catch (e) {
    if ((e as { code?: string }).code !== "42501") f.push(`envios_empresa: el insert de empresa falló por otro motivo (${(e as { code?: string }).code})`);
  }
  await c.query("ROLLBACK TO SAVEPOINT emp_ins");
  await fijar(c, "auto-a");
  if ((await c.query("UPDATE envios_empresa SET estado_bandeja = 'no_seleccionada' WHERE usuaria_id = 'auto-a'")).rowCount !== 0) f.push("envios_empresa: la candidata CAMBIA el estado de la bandeja");
  // 5) Y una usuaria no ve envíos de otras empresas por tener la variable de empresa vacía: ya cubierto arriba.
  return f;
}

test("RLS: con el rol de la web, una usuaria no lee, actualiza ni inserta filas de otra, y sin variable no ve nada", { skip: !hay && "sin contraseñas en el entorno" }, async () => {
  await web.query("BEGIN");
  try {
    assert.deepEqual(await fugas(web), []);
  } finally {
    await web.query("ROLLBACK");
  }
});

test("RLS: la prueba de la prueba — si se rompe una política a propósito, el test encuentra la fuga", { skip: !hay && "sin contraseñas en el entorno" }, async () => {
  for (const [tabla, esperado] of [
    ["perfiles", "perfiles: LEE filas de otra usuaria"],
    ["matches", "matches: LEE filas de otra usuaria"],
    ["candidaturas", "candidaturas: LEE filas de otra usuaria"],
    ["preferencias", "preferencias: LEE filas de otra usuaria"],
    ["envios_empresa", "envios_empresa: LEE filas de otra usuaria"],
  ]) {
    await dueno.query("BEGIN");
    try {
      // política rota a propósito (se deshace); envios_empresa tiene una política por comando (025) y la de lectura no admite WITH CHECK
      await dueno.query(tabla === "envios_empresa" ? "ALTER POLICY envio_select ON envios_empresa USING (true)" : `ALTER POLICY propia_usuaria ON ${tabla} USING (true) WITH CHECK (true)`);
      await dueno.query("SET LOCAL ROLE horma_web");
      const f = await fugas(dueno);
      assert.ok(f.includes(esperado), `con la política de ${tabla} rota debía detectarse la fuga; salió: ${JSON.stringify(f)}`);
    } finally {
      await dueno.query("ROLLBACK");
    }
  }
  // Y tras deshacerlo, la política original sigue en pie.
  await web.query("BEGIN");
  try { assert.deepEqual(await fugas(web), []); } finally { await web.query("ROLLBACK"); }
});

test("RLS: conUsuaria / conEmpresa fijan la sesión solo dentro de su transacción (el pool no arrastra la variable)", { skip: !hay && "sin contraseñas en el entorno" }, async () => {
  for (let i = 0; i < 6; i++) { // varias vueltas: el pool reutiliza conexiones
    const suyo = await conUsuaria("auto-a", (c) => c.query("SELECT usuaria_id FROM perfiles"));
    assert.deepEqual(suyo.rows.map((r) => r.usuaria_id), ["auto-a"]);
    const fuera = await db().query("SELECT count(*)::int AS n FROM perfiles WHERE usuaria_id LIKE 'auto-%'");
    assert.equal(fuera.rows[0].n, 0, "sin conUsuaria no hay filas, ni siquiera en una conexión que acaba de usarse");
  }
  const bandeja = await conEmpresa("auto-rls-e2", (c) => c.query("SELECT empresa_id FROM envios_empresa"));
  assert.deepEqual(bandeja.rows.map((r) => r.empresa_id), ["auto-rls-e2"]);
  await assert.rejects(() => conUsuaria("", async () => 1), /identificador/);
  // Un error dentro de la función deshace la transacción y la conexión vuelve limpia.
  await assert.rejects(() => conUsuaria("auto-a", (c) => c.query("SELECT 1 FROM tabla_que_no_existe")));
  assert.equal((await db().query("SELECT count(*)::int AS n FROM perfiles WHERE usuaria_id LIKE 'auto-%'")).rows[0].n, 0);
});

test("RLS: la lista de administración sigue sabiendo quién tiene perfil, sin leer perfiles ajenos", { skip: !hay && "sin contraseñas en el entorno" }, async () => {
  const r = await db().query("SELECT usuaria_id FROM usuarias_con_perfil() WHERE usuaria_id LIKE 'auto-%' ORDER BY 1");
  assert.deepEqual(r.rows.map((x) => x.usuaria_id), ["auto-a", "auto-b"]);
  assert.equal((await db().query("SELECT count(*)::int AS n FROM perfiles")).rows[0].n, 0);
});
// La guarda estática («nadie usa db().query suelto con tablas de RLS») vive en rls-guarda.test.ts.
