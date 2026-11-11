// Exporta TODOS los datos de una usuaria (RGPD: derecho de acceso y portabilidad). Solo lee.
// Uso (desde web/): npm run exportar -- --usuaria <id>
// Crea datos/exportaciones/<id>-<fecha>/ con base-de-datos.json y copias de sus carpetas en disco.
// Esa carpeta lleva datos personales: se entrega a la usuaria y se borra después. No se sube a git.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro } from "../src/lib/importar.ts";
import { idValido, SQL_EXPORTAR, copiarA, inspeccionar } from "../src/lib/datos-usuaria.ts";

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) { console.error(problema); process.exit(1); }

const args = process.argv.slice(2);
const i = args.indexOf("--usuaria");
const id = i >= 0 ? args[i + 1] : undefined;
if (!id || !idValido(id)) {
  console.error("Uso: npm run exportar -- --usuaria <id>  (id: letras, números, - _ .; máximo 80)");
  process.exit(1);
}

const DATOS = resolve(import.meta.dirname, "..", "..", "datos");
const destino = join(DATOS, "exportaciones", `${id}-${new Date().toISOString().slice(0, 10)}`);
if (existsSync(destino)) {
  console.error("Ya existe una exportación de hoy para esa usuaria: bórrala o muévela antes de repetir.");
  process.exit(1);
}

const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
try {
  await db.connect();
  const usuaria = await db.query(SQL_EXPORTAR.usuaria, [id]);
  const cuenta = await db.query(SQL_EXPORTAR.cuenta, [id]);
  const perfil = await db.query(SQL_EXPORTAR.perfil, [id]);
  const preferencias = await db.query(SQL_EXPORTAR.preferencias, [id]);
  const matches = await db.query(SQL_EXPORTAR.matches, [id]);
  const candidaturas = await db.query(SQL_EXPORTAR.candidaturas, [id]);
  const enviosEmpresa = await db.query(SQL_EXPORTAR.envios_empresa, [id]);
  const enBase = usuaria.rowCount ?? 0;
  const choque = await db.query("SELECT count(*)::int AS n FROM usuarias WHERE lower(id) = lower($1)", [id]);
  if (choque.rows[0].n > 1) throw new Error("hay ids que solo se distinguen por mayúsculas: resuélvelo a mano");
  if (enBase === 0 && inspeccionar(DATOS, id).length === 0) { // también aborta si hay enlaces simbólicos
    console.error("No hay datos de esa usuaria, ni en la base ni en disco. No se crea nada.");
    process.exit(1);
  }
  let carpetas;
  try {
    carpetas = copiarA(DATOS, id, destino);
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, "base-de-datos.json"), JSON.stringify({
      exportado_en: new Date().toISOString(),
      usuaria: usuaria.rows[0]?.dato ?? null,
      cuenta: cuenta.rows[0]?.dato ?? null,
      perfil: perfil.rows[0]?.dato ?? null,
      preferencias: preferencias.rows[0]?.dato ?? null,
      matches: matches.rows[0]?.dato ?? [],
      candidaturas: candidaturas.rows[0]?.dato ?? [],
      envios_empresa: enviosEmpresa.rows[0]?.dato ?? [],
    }, null, 2), "utf8");
  } catch (e) {
    rmSync(destino, { recursive: true, force: true }); // nunca queda una exportación a medias con datos personales
    throw e;
  }
  console.log(`Exportación creada en datos/exportaciones/ (carpeta «<id>-<fecha>»).`);
  console.log(`Base de datos: usuaria ${enBase ? "sí" : "no"} · perfil ${perfil.rowCount ? "sí" : "no"} · preferencias ${preferencias.rowCount ? "sí" : "no"}`);
  for (const c of carpetas) console.log(`Disco: ${c.carpeta}: ${c.archivos} archivos, ${c.bytes} bytes`);
  console.log("Lleva datos personales: entrégala a la usuaria y bórrala después. No se sube a git.");
} catch (e) {
  console.error("Falló la exportación:", (e as { code?: unknown })?.code ? errorSeguro(e) : (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
