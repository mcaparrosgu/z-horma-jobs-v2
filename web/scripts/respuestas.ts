// Sincroniza las respuestas del perfil entre la base (la web) y datos/usuarias/<id>/perfil.json (la pista A).
// Uso (desde web/):
//   npm run respuestas -- --usuaria <id> --bajar   base → disco: el disco queda con la lista de la base (lo que borraste en la web se borra).
//                                                   Se niega si el disco tiene respuestas que la base no tiene: haz --subir antes.
//   npm run respuestas -- --usuaria <id> --subir   disco → base: SOLO añade (respuestas || nuevas, atómico); nunca borra ni reescribe lo que hay.
//                                                   Úsalo justo después de --bajar: con un disco desfasado volvería a subir algo que borraste en la web.
// `/candidatura` hace «bajar» antes de redactar y «subir» tras guardar una respuesta. Solo respuestas válidas y sin órdenes a una IA.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro } from "../src/lib/importar.ts";
import { idValido } from "../src/lib/datos-usuaria.ts";
import { nuevasDelDisco, respuestasImportables, SQL_AGREGAR_RESPUESTA, MAX_RESPUESTAS } from "../src/lib/respuestas.ts";

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) { console.error(problema); process.exit(1); }

const args = process.argv.slice(2);
const i = args.indexOf("--usuaria");
const id = i >= 0 ? args[i + 1] : undefined;
const bajar = args.includes("--bajar"), subir = args.includes("--subir");
if (!id || !idValido(id) || bajar === subir) {
  console.error("Uso: npm run respuestas -- --usuaria <id> (--bajar | --subir)");
  process.exit(1);
}

const archivo = join(resolve(import.meta.dirname, "..", "..", "datos"), "usuarias", id, "perfil.json");
if (!existsSync(archivo)) { console.error("No existe datos/usuarias/(usuaria)/perfil.json: no hay nada que sincronizar."); process.exit(1); }
let perfil: Record<string, unknown>;
try {
  const leido: unknown = JSON.parse(readFileSync(archivo, "utf-8"));
  if (!leido || typeof leido !== "object" || Array.isArray(leido)) throw new Error("no es un objeto");
  perfil = leido as Record<string, unknown>;
} catch {
  console.error("perfil.json no es un JSON válido (no se muestra su contenido): corrígelo antes de sincronizar."); // el mensaje de JSON.parse puede citar datos personales
  process.exit(1);
}

const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
try {
  await db.connect();
  const f = await db.query("SELECT respuestas FROM perfiles WHERE usuaria_id = $1", [id]);
  if (f.rowCount === 0) { console.error("Esa usuaria no tiene perfil en la base: impórtalo primero (npm run importar)."); process.exit(1); }
  const crudas = f.rows[0].respuestas as unknown;
  const pendientes = nuevasDelDisco(crudas, perfil.respuestas);
  if (bajar) {
    if (pendientes.length > 0) {
      console.error(`El disco tiene ${pendientes.length} respuesta(s) que la base no tiene: no se baja para no perderlas. Ejecuta antes --subir.`);
      process.exit(1);
    }
    const enBase = respuestasImportables(crudas);
    perfil.respuestas = enBase;
    const tmp = `${archivo}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(perfil, null, 2) + "\n", "utf-8");
    renameSync(tmp, archivo);
    console.log(`Bajadas: ${enBase.length} respuestas de la base al disco.`);
  } else {
    const hay = Array.isArray(crudas) ? crudas.length : 0;
    const caben = pendientes.slice(0, Math.max(0, MAX_RESPUESTAS - hay));
    const invalidas = Array.isArray(perfil.respuestas) ? perfil.respuestas.length - respuestasImportables(perfil.respuestas).length : 0;
    if (caben.length > 0) {
      const r = await db.query(SQL_AGREGAR_RESPUESTA, [id, JSON.stringify(caben)]);
      if (r.rowCount === 0) throw new Error("no se actualizó ninguna fila");
    }
    console.log(`Subidas: ${caben.length} nuevas${pendientes.length > caben.length ? ` · ${pendientes.length - caben.length} sin subir por el tope de ${MAX_RESPUESTAS}` : ""}${invalidas ? ` · ${invalidas} del disco descartadas por inválidas` : ""}.`);
  }
} catch (e) {
  console.error(`No se pudo sincronizar (${errorSeguro(e)})`);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
