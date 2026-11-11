// Prueba de la calidad de ofertas (A1) contra la base real, con datos INVENTADOS (ids `auto-a1-…`, usuaria `auto-a1`).
// Se salta sola si no hay contraseñas en el entorno (`npm test` las carga de web/.env sin que nadie las lea).
// Demuestra: un grupo de duplicados se muestra una vez con la mejor licencia, ninguna fila se pierde, la cerrada no sale,
// la antigua baja en el orden, la recurrente se marca y reimportar cuenta una vista más.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { db, conUsuaria } from "./db.ts";
import { sqlOfertas } from "./consultas.ts";
import { SQL_MATCHES } from "./matches.ts";
import { SQL_OFERTA, paramsOferta, SQL_USUARIA, SQL_MATCH, paramsMatch } from "./importar.ts";

const hay = !!(process.env.HORMA_DB_PASSWORD && process.env.HORMA_WEB_PASSWORD);
const MARCA = "zzautoa1";
let dueno: pg.Client;

const dia = (delta: number) => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10);

const oferta = (id: string, resto: Record<string, unknown>) => ({
  id: `auto-a1-${id}`, fuente: "auto-fuente-1", url: `https://auto.example/${id}`, fecha: dia(-3),
  titulo: "Puesto", empresa: `${MARCA} Acme S.L.`, ubicacion: "Madrid, España", pais: "ES", remoto: "presencial",
  contrato: "indefinido", idioma: "es", nivel: "medio", requisitos: [], avisos: [],
  salario: { publicado: false, min: null, max: null, moneda: null }, taxonomia: { sector: null, familia: null, stack: [] },
  auditoria: {}, origen: { licencia: "abierto", atribucion: "Fuente inventada" }, ...resto,
});

async function limpiar() {
  await dueno.query("DELETE FROM matches WHERE usuaria_id = 'auto-a1'");
  await dueno.query("DELETE FROM usuarias WHERE id = 'auto-a1'");
  await dueno.query("DELETE FROM ofertas WHERE id LIKE 'auto-a1-%'");
}

before(async () => {
  if (!hay) return;
  dueno = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
  await dueno.connect();
  await limpiar();
});
after(async () => {
  if (!hay) return;
  await limpiar();
  await dueno.end();
  await db().end();
});

test("A1 contra la base: duplicados, cerradas, antiguas, recurrentes y reimportación", { skip: !hay && "sin contraseñas en el entorno" }, async () => {
  const importar = async (o: ReturnType<typeof oferta>) => dueno.query(SQL_OFERTA, paramsOferta(o));
  // Mismo puesto en dos fuentes: otra licencia, otra forma de escribir la empresa, el título y el municipio.
  await importar(oferta("a", { titulo: "Desarrollador Web (m/f)", fuente: "auto-fuente-1", origen: { licencia: "abierto", atribucion: "Fuente abierta inventada" } }));
  await importar(oferta("b", { titulo: "desarrollador web (h/m/d)", fuente: "auto-fuente-2", empresa: `${MARCA.toUpperCase()} ACME SL`, ubicacion: "Madrid (Madrid)", origen: { licencia: "empresa", atribucion: null } }));
  await importar(oferta("c", { titulo: "Analista Cerrado", fecha_cierre: dia(-1) }));
  await importar(oferta("d", { titulo: "Tester Antiguo", fecha: dia(0) }));
  await dueno.query("UPDATE ofertas SET ultima_vista = now() - interval '60 days' WHERE id = 'auto-a1-d'");
  await importar(oferta("e1", { titulo: "Gestor Recurrente", fecha: dia(0) }));
  await importar(oferta("e2", { titulo: "Gestor Recurrente", fecha: dia(-14) }));
  await importar(oferta("f", { titulo: "Soporte Fresco", fecha: dia(0) }));
  // Empate de licencia y de fecha: gana la creada más tarde.
  await importar(oferta("g1", { titulo: "Operador Doble" }));
  await importar(oferta("g2", { titulo: "Operador Doble (m/f)" }));
  await dueno.query("UPDATE ofertas SET creada_en = now() - interval '1 day' WHERE id = 'auto-a1-g1'");

  const totalAntes = (await dueno.query("SELECT count(*)::int AS n FROM ofertas WHERE id LIKE 'auto-a1-%'")).rows[0].n;
  assert.equal(totalAntes, 9);

  const { sql, params } = sqlOfertas({ q: MARCA });
  const filas = (await db().query(sql, params)).rows; // con el rol de la web, como la página
  const ids = filas.map((f) => f.id);

  assert.ok(ids.includes("auto-a1-b") && !ids.includes("auto-a1-a"), "del grupo A+B se muestra la de mejor licencia (empresa)");
  assert.ok(ids.includes("auto-a1-g2") && !ids.includes("auto-a1-g1"), "en un empate gana la más reciente");
  assert.ok(!ids.includes("auto-a1-c"), "la cerrada no sale por defecto");
  assert.deepEqual([...ids].sort(), ["auto-a1-b", "auto-a1-d", "auto-a1-e1", "auto-a1-e2", "auto-a1-f", "auto-a1-g2"]);
  assert.equal(ids[ids.length - 1], "auto-a1-d", "la que lleva más de 45 días sin verse baja en el orden y sigue visible");

  const b = filas.find((f) => f.id === "auto-a1-b");
  assert.deepEqual([...new Set(b.fuentes_grupo as string[])].sort(), ["auto-fuente-1", "auto-fuente-2"], "se dice en qué otras fuentes aparece");
  assert.equal(b.recurrente, false);
  assert.equal(filas.find((f) => f.id === "auto-a1-f").recurrente, false);
  assert.equal(filas.find((f) => f.id === "auto-a1-e1").recurrente, true, "misma empresa, puesto y municipio en otra semana");
  assert.equal(filas.find((f) => f.id === "auto-a1-e2").recurrente, true);

  // Agrupar no borra nada: las nueve filas siguen y la «perdedora» conserva su licencia y atribución.
  const despues = await dueno.query("SELECT id, licencia, atribucion FROM ofertas WHERE id LIKE 'auto-a1-%' ORDER BY id");
  assert.equal(despues.rowCount, totalAntes);
  const a = despues.rows.find((r) => r.id === "auto-a1-a");
  assert.equal(a.licencia, "abierto");
  assert.equal(a.atribucion, "Fuente abierta inventada");

  // Reimportar: una vista más, la primera no cambia, la última se refresca.
  const antes = (await dueno.query("SELECT primera_vista, ultima_vista, veces_vista FROM ofertas WHERE id = 'auto-a1-f'")).rows[0];
  assert.equal(antes.veces_vista, 1);
  await importar(oferta("f", { titulo: "Soporte Fresco" , fecha: dia(0) }));
  const tras = (await dueno.query("SELECT primera_vista, ultima_vista, veces_vista FROM ofertas WHERE id = 'auto-a1-f'")).rows[0];
  assert.equal(tras.veces_vista, 2);
  assert.equal(tras.primera_vista.getTime(), antes.primera_vista.getTime());
  assert.ok(tras.ultima_vista.getTime() >= antes.ultima_vista.getTime());

  // Recomendaciones: sin la cerrada y con el grupo una sola vez.
  await dueno.query(SQL_USUARIA, ["auto-a1"]);
  const m = { usuaria_id: "auto-a1", version_perfil: "v1", fecha: dia(0) };
  for (const o of ["a", "b", "c", "f"]) {
    await dueno.query(SQL_MATCH, paramsMatch(m, { oferta_id: `auto-a1-${o}`, nota: 50, nivel_condiciones: "encaja", explicacion: "Prueba inventada." }));
  }
  const recs = (await conUsuaria("auto-a1", (c) => c.query(SQL_MATCHES, ["auto-a1"]))).rows.map((r) => r.oferta_id).sort();
  assert.deepEqual(recs, ["auto-a1-b", "auto-a1-f"], "no se recomienda la cerrada y el duplicado sale una vez");
});
