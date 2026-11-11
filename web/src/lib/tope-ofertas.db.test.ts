// Tope de 50 ofertas activas por empresa (migraciones 032 y 033) contra la base real, con datos INVENTADOS y todo dentro
// de una transacción que se deshace. Se salta sola si no hay contraseña en el entorno.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const hay = !!process.env.HORMA_DB_PASSWORD;
let c: pg.Client;
before(async () => {
  if (!hay) return;
  c = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
  await c.connect();
});
after(async () => {
  if (!hay) return;
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
});

const insertar = (id: string, empresa: string) => c.query(
  `INSERT INTO ofertas (id, fuente, url, titulo, empresa, ubicacion, remoto, contrato, idioma, nivel, salario, auditoria, empresa_id, estado_publicacion)
   VALUES ($1,'empresa:auto','https://auto.example/o','Puesto','Auto','Madrid','hibrido','indefinido','es','junior','{}','{}',$2,'pendiente_de_revision')`, [id, empresa]);

/** Ejecuta `f` dentro de un punto de guardado: devuelve el código de error de Postgres, o null si salió bien. */
const codigo = async (f: () => Promise<unknown>) => {
  await c.query("SAVEPOINT s");
  try { await f(); await c.query("RELEASE SAVEPOINT s"); return null; }
  catch (e) { await c.query("ROLLBACK TO s"); return (e as { code?: string }).code ?? "otro"; }
};

test("el tope de 50 vale al publicar y también al reactivar una oferta rechazada", { skip: !hay }, async () => {
  await c.query("BEGIN");
  await c.query("INSERT INTO empresas (id, nombre) VALUES ('auto-tope-e', 'Auto Tope'), ('auto-tope-otra', 'Otra')");
  await c.query(`INSERT INTO ofertas (id, fuente, url, titulo, empresa, ubicacion, remoto, contrato, idioma, nivel, salario, auditoria, empresa_id, estado_publicacion)
    SELECT 'auto-tope-'||g, 'empresa:auto','https://auto.example/o','Puesto','Auto','Madrid','hibrido','indefinido','es','junior','{}','{}','auto-tope-e','pendiente_de_revision' FROM generate_series(1,50) g`);
  assert.equal(await codigo(() => insertar("auto-tope-51", "auto-tope-e")), "HJ001"); // la 51 al publicar
  assert.equal(await codigo(() => insertar("auto-tope-o1", "auto-tope-otra")), null); // otra empresa, sin problema

  // La administración rechaza una, la empresa publica otra y después edita la rechazada: no puede reactivarla.
  await c.query("UPDATE ofertas SET estado_publicacion = 'rechazada' WHERE id = 'auto-tope-1'");
  assert.equal(await codigo(() => insertar("auto-tope-52", "auto-tope-e")), null);
  assert.equal(await codigo(() => c.query("UPDATE ofertas SET estado_publicacion = 'pendiente_de_revision' WHERE id = 'auto-tope-1'")), "HJ001");
  // Aprobar una pendiente (moderación) no cambia el recuento: sigue permitido aunque la empresa esté en el tope.
  assert.equal(await codigo(() => c.query("UPDATE ofertas SET estado_publicacion = 'aprobada' WHERE id = 'auto-tope-2'")), null);
  await c.query("ROLLBACK");
});
