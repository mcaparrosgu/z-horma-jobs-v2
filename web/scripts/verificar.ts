// Comprueba que lo descargado coincide con lo guardado. SOLO LEE los datos: no toca ofertas ni archivos. Lo único que escribe es un evento de observabilidad (solo números).
//   raw/*.md  →  procesadas/*.json  →  tabla ofertas
// Uso (desde web/): npm run verificar
//                   npm run verificar -- --dir ../datos/ofertas   (otra carpeta con raw/ y procesadas/)
//                   npm run verificar -- --ids                    (enseña los ids completos; por defecto salen como oferta#<huella>)
// Código de salida: 0 si todo cuadra; 1 si algo no cuadra. La salida lleva ids y nombres de campo, nunca valores (y los ids, enmascarados salvo con --ids).
import { readdirSync, readFileSync, existsSync, lstatSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import pg from "pg";
import { validar } from "../src/lib/esquemas.ts";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro, registrarEvento } from "../src/lib/importar.ts";
import { SQL_FILAS, cruzar, hayFallos, origenDeRaw, origenCoincide, idOculto } from "../src/lib/verificar.ts";

const MAX_BYTES = 1_000_000;
const inicio = Date.now();

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) {
  console.error(problema);
  process.exit(1);
}

const args = process.argv.slice(2);
const i = args.indexOf("--dir");
if (i >= 0 && (!args[i + 1] || args[i + 1].startsWith("--"))) {
  console.error("--dir necesita una carpeta: npm run verificar -- --dir ../datos/ofertas");
  process.exit(1);
}
const RAIZ = resolve(i >= 0 ? args[i + 1] : join(import.meta.dirname, "..", "..", "datos", "ofertas"));
if (!existsSync(RAIZ) || !statSync(RAIZ).isDirectory()) {
  console.error("--dir debe ser una carpeta que exista:", RAIZ);
  process.exit(1);
}

/** Nombres (sin extensión) de los archivos normales de una carpeta con esa extensión. Ignora enlaces simbólicos. */
function listar(carpeta: string, ext: string): string[] {
  const ruta = join(RAIZ, carpeta);
  if (!existsSync(ruta) || !lstatSync(ruta).isDirectory()) return [];
  return readdirSync(ruta)
    .filter((f) => f.endsWith(ext) && lstatSync(join(ruta, f)).isFile())
    .map((f) => basename(f, ext))
    .sort();
}

const raw = listar("raw", ".md");
const procesadas = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
const invalidas: string[] = [];
for (const id of listar("procesadas", ".json")) {
  const archivo = join(RAIZ, "procesadas", `${id}.json`);
  try {
    if (lstatSync(archivo).size > MAX_BYTES) throw new Error("grande");
    const r = validar("oferta", JSON.parse(readFileSync(archivo, "utf8")));
    if (!r.ok || (r.dato as { id?: string }).id !== id) throw new Error("no valida");
    procesadas.set(id, r.dato);
  } catch {
    invalidas.push(id); // no se muestra el motivo: podría repetir texto de la oferta
  }
}

// La licencia de cada procesada debe ser la de la cabecera de su raw: el script la fija, el agente solo la copia.
const origenDistinto = [...procesadas].filter(([id, o]) => {
  try { return !origenCoincide(origenDeRaw(readFileSync(join(RAIZ, "raw", `${id}.md`), "utf8")), o); } catch { return false; }
}).map(([id]) => id);

const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
try {
  await db.connect();
  const filas = new Map<string, any>((await db.query(SQL_FILAS)).rows.map((f) => [f.id, f])); // eslint-disable-line @typescript-eslint/no-explicit-any
  // Una procesada inválida ya se cuenta como inválida: no se cuenta además como «raw sin procesar».
  const inf = cruzar(raw.filter((id) => !invalidas.includes(id)), procesadas, filas);
  inf.invalidas = invalidas;
  inf.origenDistinto = origenDistinto;

  const nombre = (id: string) => idOculto(id, process.argv.includes("--ids"));
  const lista = (titulo: string, ids: string[]) => {
    if (ids.length) console.log(`${titulo} (${ids.length}):\n${ids.map((x) => `  - ${nombre(x)}`).join("\n")}`);
  };
  console.log(`Descargadas (raw): ${raw.length} · procesadas: ${procesadas.size + invalidas.length} · filas en la base: ${filas.size}`);
  console.log(`Coinciden archivo y base: ${inf.coinciden}`);
  lista("FALLO  procesadas inválidas (no son JSON, no cumplen el esquema o su id no es el nombre del archivo)", inf.invalidas);
  if (inf.distintas.length) {
    console.log(`FALLO  la base no coincide con el archivo (${inf.distintas.length}):\n${inf.distintas.map((d) => `  - ${nombre(d.id)}: ${d.campos.join(", ")}`).join("\n")}`);
  }
  lista("FALLO  el `origen` (licencia) no es el de la cabecera del raw: reprocesa la oferta", inf.origenDistinto);
  lista("FALLO  procesadas sin fila en la base (falta importar: npm run importar -- --ofertas ../datos/ofertas/procesadas)", inf.sinFila);
  lista("FALLO  descargadas sin procesar (tanda a medias: /ingestar-ofertas)", inf.sinProcesada);
  lista("AVISO  filas en la base sin archivo (no se borran solas)", inf.soloEnBase);
  if (inf.deClavePrueba) console.log(`Filas de prueba esperadas (of-prueba-*): ${inf.deClavePrueba}`);

  // Observabilidad: /salud enseña cuándo corrió por última vez y si cuadraba. Solo números, nunca ids ni valores.
  const fallos = inf.invalidas.length + inf.distintas.length + inf.origenDistinto.length + inf.sinFila.length + inf.sinProcesada.length;
  // Con --dir se verifica otra carpeta (pruebas): no debe poner /salud en verde por datos/ofertas.
  if (i < 0) await registrarEvento(db, {
    componente: "verificador", accion: "verificar", resultado: hayFallos(inf) ? "error" : "ok",
    duracion_ms: Date.now() - inicio, detalle: { coinciden: inf.coinciden, fallos, avisos: inf.soloEnBase.length },
  }).catch(() => console.log("aviso  no se pudo anotar el evento de esta verificación"));

  if (hayFallos(inf)) {
    console.log("\nRESULTADO: no cuadra.");
    process.exitCode = 1;
  } else {
    console.log("\nRESULTADO: todo cuadra.");
  }
} catch (e) {
  console.error("Verificación interrumpida:", errorSeguro(e));
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
