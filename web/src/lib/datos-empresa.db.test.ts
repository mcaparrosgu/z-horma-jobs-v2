// RGPD de empresas contra la base real (B4-11), con datos INVENTADOS y todo dentro de una transacción que se deshace:
// no deja nada. Se salta sola si no hay contraseña en el entorno.
// Lo que manda: borrar una empresa NO borra las candidaturas ni recomendaciones de candidatas que usaron sus ofertas.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { SQL_EXPORTAR_EMPRESA, SQL_RESUMEN, SQL_BORRAR_EMPRESA, NOMBRE_BAJA, idEmpresaValido } from "./datos-empresa.ts";

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

const ofertaSql = `INSERT INTO ofertas (id, fuente, url, titulo, empresa, ubicacion, remoto, contrato, idioma, nivel, salario, auditoria, empresa_id, estado_publicacion, descripcion, licencia, atribucion)
  VALUES ($1,'empresa:auto-rgpd-e','https://auto.example/o','Puesto','Auto Acme RGPD','Madrid','hibrido','indefinido','es','junior','{}','{}','auto-rgpd-e','pendiente_de_revision','Texto de la empresa','empresa','Auto Acme RGPD')`;

test("el id de empresa se valida antes de tocar nada", () => {
  assert.equal(idEmpresaValido("empresa-demo"), true);
  for (const mal of ["", "Empresa", "a b", "a;b", "x".repeat(81), null, undefined, 5]) assert.equal(idEmpresaValido(mal), false, String(mal));
});

test("borrar una empresa conserva, anonimizadas, las ofertas con candidaturas y borra el resto", { skip: !hay }, async () => {
  await c.query("BEGIN");
  await c.query("INSERT INTO empresas (id, nombre) VALUES ('auto-rgpd-e', 'Auto Acme RGPD')");
  await c.query("INSERT INTO cuentas_empresa (empresa_id, email, hash) VALUES ('auto-rgpd-e', 'rgpd@auto.example', 'scrypt$1$1$1$AAAA$BBBB')");
  await c.query("INSERT INTO usuarias (id) VALUES ('auto-rgpd-u')");
  await c.query(ofertaSql, ["auto-rgpd-usada"]);
  await c.query(ofertaSql, ["auto-rgpd-libre"]);
  await c.query(ofertaSql, ["auto-rgpd-pendiente"]); // se queda «pendiente_de_revision», con una candidata encima
  await c.query("UPDATE ofertas SET estado_publicacion = 'aprobada' WHERE id IN ('auto-rgpd-usada', 'auto-rgpd-libre')");
  await c.query("INSERT INTO candidaturas (usuaria_id, oferta_id, estado, cv_usado, cv_md, historial, traza, huecos, ats) VALUES ('auto-rgpd-u','auto-rgpd-usada','borrador','adaptado','CV inventado','[]','[]','[]','{}'), ('auto-rgpd-u','auto-rgpd-pendiente','borrador','adaptado','CV inventado','[]','[]','[]','{}')");
  await c.query("ALTER TABLE envios_empresa DISABLE TRIGGER envios_empresa_comprobar"); // se deshace con la transacción
  await c.query("INSERT INTO envios_empresa (usuaria_id, oferta_id, empresa_id, cv_md) VALUES ('auto-rgpd-u','auto-rgpd-usada','auto-rgpd-e','CV inventado')");

  const antes = (await c.query(SQL_RESUMEN, ["auto-rgpd-e"])).rows[0];
  assert.deepEqual(antes, { empresas: 1, cuentas: 1, sesiones: 0, candidaturas_recibidas: 1, ofertas: 3, ofertas_conservadas: 2 });

  // La exportación: con el correo, sin hash y sin el contenido de las candidaturas recibidas.
  const cuenta = (await c.query(SQL_EXPORTAR_EMPRESA.cuenta, ["auto-rgpd-e"])).rows[0].dato;
  assert.equal(cuenta.email, "rgpd@auto.example");
  assert.equal("hash" in cuenta, false);
  const recibidas = (await c.query(SQL_EXPORTAR_EMPRESA.candidaturas_recibidas, ["auto-rgpd-e"])).rows[0].dato;
  assert.deepEqual(Object.keys(recibidas[0]).sort(), ["enviado_en", "estado_bandeja", "oferta_id"]);
  const exportadas = (await c.query(SQL_EXPORTAR_EMPRESA.ofertas, ["auto-rgpd-e"])).rows[0].dato;
  assert.equal(exportadas.length, 3);
  assert.equal("auditoria" in exportadas[0], false); // nada de auditoría interna ni columnas no listadas

  for (const sql of SQL_BORRAR_EMPRESA) await c.query(sql, sql.includes("$2") ? ["auto-rgpd-e", NOMBRE_BAJA] : ["auto-rgpd-e"]);

  assert.equal((await c.query("SELECT count(*)::int AS n FROM empresas WHERE id = 'auto-rgpd-e'")).rows[0].n, 0);
  assert.equal((await c.query("SELECT count(*)::int AS n FROM cuentas_empresa WHERE empresa_id = 'auto-rgpd-e'")).rows[0].n, 0);
  assert.equal((await c.query("SELECT count(*)::int AS n FROM envios_empresa WHERE usuaria_id = 'auto-rgpd-u'")).rows[0].n, 0);
  assert.equal((await c.query("SELECT count(*)::int AS n FROM ofertas WHERE id = 'auto-rgpd-libre'")).rows[0].n, 0);
  // La candidata no pierde nada:
  assert.equal((await c.query("SELECT count(*)::int AS n FROM candidaturas WHERE usuaria_id = 'auto-rgpd-u'")).rows[0].n, 2);
  const o = (await c.query("SELECT empresa_id, empresa, atribucion, descripcion, estado_publicacion, fuente, auditoria FROM ofertas WHERE id = 'auto-rgpd-usada'")).rows[0];
  assert.deepEqual(o, { empresa_id: null, empresa: NOMBRE_BAJA, atribucion: NOMBRE_BAJA, descripcion: null, estado_publicacion: "cerrada", fuente: "empresa:baja", auditoria: {} });
  // Restos que podían nombrar a la empresa: fuera. Y una oferta huérfana pendiente pasa a rechazada (no se aprueba por error).
  const r = (await c.query("SELECT estado_publicacion, requisitos, avisos, url FROM ofertas WHERE id = 'auto-rgpd-pendiente'")).rows[0];
  assert.equal(r.estado_publicacion, "rechazada");
  assert.deepEqual([r.requisitos, r.avisos], [[], []]);
  assert.equal(r.url, "https://horma.invalid/oferta-dada-de-baja/auto-rgpd-pendiente");
  await c.query("ROLLBACK");
});
