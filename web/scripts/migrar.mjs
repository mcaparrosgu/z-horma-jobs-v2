// Aplica en orden las migraciones de db/migraciones/ que aún no se hayan aplicado.
// Uso (desde web/): npm run migrar
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro } from "../src/lib/importar.ts";

const password = process.env.HORMA_DB_PASSWORD;
const problema = problemaClave(password);
if (problema) {
  console.error(problema);
  process.exit(1);
}

const client = new pg.Client({
  host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password,
});
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
    nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`);
  const hechas = new Set((await client.query("SELECT nombre FROM migraciones_aplicadas")).rows.map(r => r.nombre));
  const dir = join(import.meta.dirname, "..", "db", "migraciones");
  const archivos = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
  let nuevas = 0;
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(join(dir, f), "utf8"));
      await client.query("INSERT INTO migraciones_aplicadas (nombre) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log("aplicada:", f);
      nuevas++;
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`Falló ${f}: ${errorSeguro(e)}`);
    }
  }
  // La contraseña del rol de la web no puede ir en una migración (se sube a git): se pone aquí, desde .env.
  const claveWeb = process.env.HORMA_WEB_PASSWORD;
  const problemaWeb = problemaClave(claveWeb, "HORMA_WEB_PASSWORD");
  const existeRol = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'horma_web'")).rowCount > 0;
  if (existeRol) {
    if (problemaWeb) throw new Error(problemaWeb);
    await client.query(`ALTER ROLE horma_web PASSWORD ${client.escapeLiteral(claveWeb)}`);
    console.log("rol horma_web: contraseña al día.");
  }
  if (nuevas === 0) console.log("Nada que aplicar: la base de datos está al día.");
} finally {
  await client.end();
}
