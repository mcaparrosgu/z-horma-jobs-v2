// Carga en Postgres las ofertas, perfiles y preferencias de datos/ (por defecto, solo datos/fixtures/).
// Repetible: ejecutarlo dos veces no duplica nada.
//   - Ofertas: se actualizan (son comunes y nadie las edita a mano).
//   - Perfiles y preferencias: NO se pisan si ya existen (las edita la usuaria); --forzar los sobrescribe.
// Uso (desde web/): npm run importar                 ->  datos/fixtures
//                   npm run importar -- --dir ../datos/otra-carpeta
//                   npm run importar -- --forzar
//                   npm run importar -- --ofertas ../datos/ofertas/procesadas   ->  solo ofertas ya procesadas
//                   npm run importar -- --dir ../datos                          ->  todo lo de datos/ (ofertas de ofertas/procesadas/ incluidas)
import { readdirSync, readFileSync, existsSync, lstatSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { validar } from "../src/lib/esquemas.ts";
import { problemaClave } from "../src/lib/clave.ts";
import {
  fuentesDeEndpoints, SQL_SINCRONIZAR_FUENTE, paramsSincronizarFuente, SQL_ABRIR_EJECUCION, SQL_CERRAR_EJECUCION,
  paramsCerrarEjecucion, cuentaVacia, anotarRechazo, anotarInterrupcion, type CuentaEjecucion,
} from "../src/lib/ingesta.ts";
import { idValido, rutaCorta as rutaCortaDe } from "../src/lib/datos-usuaria.ts";
import { origenDeRaw, origenCoincide } from "../src/lib/verificar.ts";
import { preguntasImportables } from "../src/lib/preguntas.ts";
import {
  SQL_OFERTA, SQL_USUARIA, SQL_MATCH, SQL_CANDIDATURA, SQL_VERSION_NUEVA, paramsVersionNueva, sqlPerfil, sqlPreferencias,
  paramsOferta, paramsPerfil, paramsPreferencias, paramsMatch, paramsCandidatura, incoherenciaCandidatura, soloClavesAts, registrarEvento, errorSeguro,
} from "../src/lib/importar.ts";

const MAX_BYTES = 1_000_000; // tope por archivo: un JSON enorme no debe agotar la memoria

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) {
  console.error(problema);
  process.exit(1);
}
const password = process.env.HORMA_DB_PASSWORD as string;

const args = process.argv.slice(2);
const forzar = args.includes("--forzar");
const i = args.indexOf("--dir");
if (i >= 0 && (!args[i + 1] || args[i + 1].startsWith("--"))) {
  console.error("--dir necesita una carpeta: npm run importar -- --dir ../datos/otra-carpeta");
  process.exit(1);
}
const io = args.indexOf("--ofertas");
if (io >= 0 && (!args[io + 1] || args[io + 1].startsWith("--"))) {
  console.error("--ofertas necesita una carpeta: npm run importar -- --ofertas ../datos/ofertas/procesadas");
  process.exit(1);
}
const SOLO_OFERTAS = io >= 0 ? resolve(args[io + 1]) : null; // modo «solo ofertas»: no toca perfiles
if (SOLO_OFERTAS && (!existsSync(SOLO_OFERTAS) || !statSync(SOLO_OFERTAS).isDirectory())) {
  console.error("--ofertas debe ser una carpeta que exista:", SOLO_OFERTAS);
  process.exit(1);
}
const RAIZ = resolve(i >= 0 ? args[i + 1] : join(import.meta.dirname, "..", "..", "datos", "fixtures"));
if (!existsSync(RAIZ) || !statSync(RAIZ).isDirectory()) {
  console.error("--dir debe ser una carpeta que exista:", RAIZ);
  process.exit(1);
}

/** Motivo por el que NO se debe leer una ruta (enlace simbólico, no es archivo o carpeta, demasiado grande), o null. */
function motivoRechazo(ruta: string, tipo: "archivo" | "carpeta"): string | null {
  const st = lstatSync(ruta);
  if (st.isSymbolicLink()) return "es un enlace simbólico";
  if (tipo === "carpeta" && !st.isDirectory()) return "no es una carpeta";
  if (tipo === "archivo" && !st.isFile()) return "no es un archivo";
  if (tipo === "archivo" && st.size > MAX_BYTES) return "supera 1 MB";
  return null;
}

/** Ruta relativa para la consola: el nombre de la carpeta de una usuaria (su id) se oculta. */
const rutaCorta = (ruta: string) => rutaCortaDe(RAIZ, ruta);

/** Texto de cv.md (el que citan los «origen» del perfil), o null si falta o no se debe leer. */
function leerCv(carpeta: string): string | null {
  const ruta = join(carpeta, "cv.md");
  if (!existsSync(ruta)) return null;
  const m = motivoRechazo(ruta, "archivo");
  if (m) {
    console.log(`aviso     ${rutaCorta(ruta)}: no se importa (${m})`);
    return null;
  }
  const texto = readFileSync(ruta, "utf8");
  if (texto.includes("\u0000")) { // Postgres no admite el carácter NUL en un texto
    console.log(`aviso     ${rutaCorta(ruta)}: contiene caracteres nulos, no se importa`);
    return null;
  }
  if (texto.length > 200_000) { // tope de la columna cv_texto (migración 003)
    console.log(`aviso     ${rutaCorta(ruta)}: supera 200000 caracteres, no se importa`);
    return null;
  }
  return texto;
}

const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password });
await db.connect();

// Fuentes registradas (endpoints.json): solo las ofertas de estas fuentes cuentan en una ejecución de ingesta.
const RUTA_ENDPOINTS = join(import.meta.dirname, "..", "..", ".claude", "skills", "fuentes-ofertas", "endpoints.json");
let FUENTES = new Map<string, Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
if (existsSync(RUTA_ENDPOINTS) && !motivoRechazo(RUTA_ENDPOINTS, "archivo")) {
  try { FUENTES = fuentesDeEndpoints(JSON.parse(readFileSync(RUTA_ENDPOINTS, "utf8"))); } catch { /* sin endpoints legibles: no se registran ejecuciones */ }
}
const ejecuciones = new Map<string, { id: number; cuenta: CuentaEjecucion }>();

/** Nombre de la fuente de un archivo de oferta si está registrada; null si no (o si el archivo no se puede leer). */
function fuenteRegistrada(ruta: string): string | null {
  if (motivoRechazo(ruta, "archivo")) return null;
  try {
    const f = JSON.parse(readFileSync(ruta, "utf8"))?.fuente;
    return typeof f === "string" && FUENTES.has(f) ? f : null;
  } catch { return null; }
}

/** Primera oferta de una fuente: se asegura su fila en `fuentes` y se abre su ejecución. */
async function ejecucionDe(fuente: string) {
  let e = ejecuciones.get(fuente);
  if (!e) {
    await db.query(SQL_SINCRONIZAR_FUENTE, paramsSincronizarFuente(FUENTES.get(fuente)!));
    const id = (await db.query(SQL_ABRIR_EJECUCION, [fuente])).rows[0].id as number;
    e = { id, cuenta: cuentaVacia() };
    ejecuciones.set(fuente, e);
  }
  return e;
}

async function cerrarEjecuciones() {
  for (const { id, cuenta: c } of ejecuciones.values()) await db.query(SQL_CERRAR_EJECUCION, paramsCerrarEjecucion(id, c));
  ejecuciones.clear();
}

const cuenta = { archivos: 0, importadas: 0, omitidas: 0, rechazadas: 0, avisos: 0 };
const inicio = Date.now();

/** Valida y guarda un archivo. Devuelve true si se aceptó. `guardar` devuelve las filas tocadas. */
async function importar(
  archivo: string,
  esquema: "oferta" | "perfil" | "preferencias" | "match",
  guardar: (dato: any) => Promise<number>, // eslint-disable-line @typescript-eslint/no-explicit-any
  comprobar?: (dato: any) => string | null, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<boolean> {
  cuenta.archivos++;
  const nombre = rutaCorta(archivo);
  const motivo = motivoRechazo(archivo, "archivo");
  if (motivo) {
    cuenta.rechazadas++;
    console.log(`RECHAZADO ${nombre}: ${motivo}`);
    return false;
  }
  let dato: unknown;
  try {
    dato = JSON.parse(readFileSync(archivo, "utf8"));
  } catch {
    cuenta.rechazadas++;
    console.log(`RECHAZADO ${nombre}: no es JSON válido`);
    return false;
  }
  const r = validar(esquema, dato);
  if (!r.ok) {
    cuenta.rechazadas++;
    console.log(`RECHAZADO ${nombre}:\n  - ${r.errores.join("\n  - ")}`);
    return false;
  }
  const incoherencia = comprobar?.(r.dato);
  if (incoherencia) {
    cuenta.rechazadas++;
    console.log(`RECHAZADO ${nombre}: ${incoherencia}`);
    return false;
  }
  await db.query("BEGIN");
  try {
    const filas = await guardar(r.dato);
    await db.query("COMMIT");
    cuenta.importadas++;
    console.log(`ok        ${nombre}${filas === 0 ? " (ya existía: sin cambios; usa --forzar para sobrescribir)" : ""}`);
    return true;
  } catch (e) {
    await db.query("ROLLBACK");
    cuenta.rechazadas++;
    // Nunca e.message: Postgres puede repetir el valor que falló (podría ser un dato personal).
    console.log(`ERROR BD  ${nombre}: ${errorSeguro(e)}`);
    return false;
  }
}

try {
  // Ofertas: …/ofertas/*.json
  // En datos/ las deja /ingestar-ofertas en ofertas/procesadas/; en los fixtures están directamente en ofertas/.
  const conProcesadas = join(RAIZ, "ofertas", "procesadas");
  const dirOfertas = SOLO_OFERTAS ?? (existsSync(conProcesadas) ? conProcesadas : join(RAIZ, "ofertas"));
  if (existsSync(dirOfertas)) {
    const m = motivoRechazo(dirOfertas, "carpeta");
    if (m) {
      cuenta.omitidas++;
      console.log(`omitida   ofertas: ${m}`);
    }
    else {
      for (const f of readdirSync(dirOfertas).filter((f) => f.endsWith(".json")).sort()) {
        const ruta = join(dirOfertas, f);
        const fuente = fuenteRegistrada(ruta);
        const ej = fuente ? await ejecucionDe(fuente) : null;
        // La licencia la fija el script en la cabecera del raw: si el agente la cambió, no se guarda.
        const rutaRaw = join(dirOfertas, "..", "raw", f.replace(/\.json$/, ".md"));
        const ok = await importar(
          ruta, "oferta",
          async (o) => (await db.query(SQL_OFERTA, paramsOferta(o, ej?.id ?? null))).rowCount ?? 0,
          (o) => {
            let raw = null;
            try { if (!motivoRechazo(rutaRaw, "archivo")) raw = origenDeRaw(readFileSync(rutaRaw, "utf8")); } catch { /* sin raw (o enlace/archivo enorme): nada que comparar */ }
            return origenCoincide(raw, o) ? null : "el `origen` (licencia) no es el de la cabecera del raw: reprocesa la oferta";
          },
        );
        if (ej) { if (ok) ej.cuenta.entraron++; else anotarRechazo(ej.cuenta, "archivo rechazado"); }
      }
    }
  }

  // Perfiles: …/perfiles/<usuaria>/perfil.json y preferencias.json
  // `perfiles/` es la carpeta de los fixtures; `usuarias/` la de /perfilar con usuarias reales.
  const dirPerfiles = ["perfiles", "usuarias"].map((n) => join(RAIZ, n)).find((r) => existsSync(r)) ?? join(RAIZ, "perfiles");
  const mp = SOLO_OFERTAS ? null : existsSync(dirPerfiles) ? motivoRechazo(dirPerfiles, "carpeta") : null;
  if (mp) {
    cuenta.omitidas++;
    console.log(`omitida   perfiles: ${mp}`);
  } else if (!SOLO_OFERTAS && existsSync(dirPerfiles)) {
    let nPerfil = 0;
    for (const u of readdirSync(dirPerfiles).sort()) {
      const etiqueta = `perfil nº ${++nPerfil}`; // el id de la usuaria no va a la consola ni a los logs
      const carpeta = join(dirPerfiles, u);
      const m = motivoRechazo(carpeta, "carpeta");
      if (m) {
        cuenta.omitidas++;
        console.log(`omitida   ${etiqueta}: ${m}`);
        continue;
      }
      const perfil = join(carpeta, "perfil.json");
      const prefs = join(carpeta, "preferencias.json");
      if (!existsSync(perfil)) {
        cuenta.omitidas++;
        console.log(`omitida   ${etiqueta}: aún no tiene perfil.json`);
        continue;
      }
      const perfilOk = await importar(
        perfil, "perfil",
        async (p) => {
          await db.query(SQL_USUARIA, [u]);
          return (await db.query(sqlPerfil(forzar), paramsPerfil(p, leerCv(carpeta)))).rowCount ?? 0;
        },
        (p) => (p.usuaria_id !== u ? "usuaria_id no coincide con el nombre de la carpeta" : null),
      );
      if (!existsSync(prefs)) continue;
      if (!perfilOk) {
        // Sin perfil aceptado no se crea la usuaria solo con preferencias (datos a medias).
        cuenta.omitidas++;
        console.log(`omitida   ${etiqueta}/preferencias.json: su perfil.json fue rechazado`);
        continue;
      }
      await importar(prefs, "preferencias", async (p) => {
        await db.query(SQL_USUARIA, [u]);
        return (await db.query(sqlPreferencias(forzar), paramsPreferencias(u, p))).rowCount ?? 0;
      });
    }
  }

  // Recomendaciones: …/matches/<usuaria>/AAAA-MM-DD.json (los demás archivos de esa carpeta son de trabajo y no se leen).
  const dirMatches = join(RAIZ, "matches");
  if (!SOLO_OFERTAS && existsSync(dirMatches) && !motivoRechazo(dirMatches, "carpeta")) {
    let nMatch = 0;
    for (const u of readdirSync(dirMatches).sort()) {
      const carpeta = join(dirMatches, u);
      ++nMatch;
      if (motivoRechazo(carpeta, "carpeta")) { cuenta.omitidas++; console.log(`omitida   matches nº ${nMatch}: no es una carpeta`); continue; }
      for (const f of readdirSync(carpeta).sort().filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))) {
        await importar(
          join(carpeta, f), "match",
          async (m) => {
            await db.query(SQL_USUARIA, [u]);
            let n = 0;
            for (const o of m.ofertas) n += (await db.query(SQL_MATCH, paramsMatch(m, o))).rowCount ?? 0;
            return n;
          },
          (m) => (m.usuaria_id !== u ? "usuaria_id no coincide con el nombre de la carpeta" : null),
        );
      }
    }
  }

  // Candidaturas: …/candidaturas/<usuaria>/<oferta>/ con estado.json, cv.md, carta.md (opcional), traza.json,
  // traza-carta.json (opcional), huecos.json y ats.json. Se juntan, se validan con el esquema `candidatura` y,
  // además, ningún agente puede haber aprobado (incoherenciaCandidatura).
  const dirCand = join(RAIZ, "candidaturas");
  if (!SOLO_OFERTAS && existsSync(dirCand) && !motivoRechazo(dirCand, "carpeta")) {
    for (const u of readdirSync(dirCand).sort()) {
      const carpetaU = join(dirCand, u);
      if (!idValido(u)) { cuenta.omitidas++; console.log("omitida   candidaturas: nombre de carpeta de usuaria no válido"); continue; }
      if (motivoRechazo(carpetaU, "carpeta")) { cuenta.omitidas++; console.log("omitida   candidaturas: no es una carpeta"); continue; }
      for (const of of readdirSync(carpetaU).sort()) {
        const carpeta = join(carpetaU, of);
        if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/.test(of)) { cuenta.omitidas++; console.log("omitida   candidaturas: nombre de carpeta de oferta no válido"); continue; }
        const nombre = `candidaturas/(usuaria)/${of}`;
        cuenta.archivos++;
        if (motivoRechazo(carpeta, "carpeta")) { cuenta.omitidas++; console.log(`omitida   ${nombre}: no es una carpeta`); continue; }
        const rechazar = (m: string) => { cuenta.rechazadas++; console.log(`RECHAZADO ${nombre}: ${m}`); };
        // Devuelve el texto, null si es opcional y no está, o lanza con el motivo (sin repetir el contenido).
        class ErrorLocal extends Error {} // solo estos mensajes son nuestros; los del sistema llevan la ruta (y el id) y no se imprimen
        const leer = (n: string, obligatorio: boolean): string | null => {
          const ruta = join(carpeta, n);
          if (!existsSync(ruta)) { if (obligatorio) throw new ErrorLocal(`${n}: falta`); return null; }
          if (motivoRechazo(ruta, "archivo")) throw new ErrorLocal(`${n}: no se puede leer`);
          const t = readFileSync(ruta, "utf8");
          if (t.includes("\u0000")) throw new ErrorLocal(`${n}: contiene caracteres nulos`);
          return t;
        };
        const textos: Record<string, string | null> = {};
        let malo: string | null = null;
        try {
          for (const [n, ob] of [["estado.json", true], ["cv.md", true], ["carta.md", false], ["traza.json", true], ["traza-carta.json", false], ["huecos.json", true], ["ats.json", true], ["preguntas.json", false]] as const) textos[n] = leer(n, ob);
        } catch (e) { malo = e instanceof ErrorLocal ? e.message : `no se puede leer (${errorSeguro(e)})`; }
        if (malo) { rechazar(malo); continue; }
        let c: Record<string, any>; let trazaCarta: unknown = null; // eslint-disable-line @typescript-eslint/no-explicit-any
        try {
          const estado = JSON.parse(textos["estado.json"]!);
          c = { ...estado, traza: JSON.parse(textos["traza.json"]!), huecos: JSON.parse(textos["huecos.json"]!), ats: soloClavesAts(JSON.parse(textos["ats.json"]!)) };
          if (textos["traza-carta.json"]) trazaCarta = JSON.parse(textos["traza-carta.json"]);
          if (textos["preguntas.json"]) c.preguntas_pendientes = JSON.parse(textos["preguntas.json"]); // opcional (esquema 0.12)
        } catch { rechazar("algún JSON no es válido"); continue; }
        const r = validar("candidatura", c);
        if (!r.ok) { rechazar(`\n  - ${r.errores.join("\n  - ")}`); continue; }
        const inc = incoherenciaCandidatura(c);
        if (inc) { rechazar(inc); continue; }
        const descartadas = (c.preguntas_pendientes?.length ?? 0) - preguntasImportables(c.preguntas_pendientes).length;
        if (descartadas > 0) { cuenta.avisos++; console.log(`aviso     ${nombre}: ${descartadas} pregunta(s) descartada(s) (repetidas, con texto que parece una orden a una IA o que pide datos que Horma nunca pide)`); }
        await db.query("BEGIN");
        try {
          await db.query(SQL_USUARIA, [u]);
          const g = await db.query(SQL_CANDIDATURA, paramsCandidatura(u, of, c, textos["cv.md"]!, textos["carta.md"], trazaCarta));
          // 0 filas = ya estaba aprobada (o más allá): el texto aprobado no se toca; se deja la versión nueva aparte.
          const v = g.rowCount === 0 && c.estado === "borrador" ? await db.query(SQL_VERSION_NUEVA, paramsVersionNueva(u, of, c, textos["cv.md"]!, textos["carta.md"], trazaCarta)) : null;
          await db.query("COMMIT");
          cuenta.importadas++;
          console.log(`ok        ${nombre}${v && v.rowCount ? " (ya aprobada: el texto aprobado no cambia; queda una versión nueva si difiere, para que la usuaria decida en la web)" : ""}`);
        } catch (e) {
          await db.query("ROLLBACK");
          rechazar(`no se pudo guardar (${errorSeguro(e)})`);
        }
      }
    }
  }

  await cerrarEjecuciones();
  await registrarEvento(db, {
    componente: "importador", accion: "importar-datos",
    resultado: cuenta.rechazadas > 0 ? "error" : "ok",
    duracion_ms: Date.now() - inicio, detalle: cuenta,
  });
  console.log(`\nResumen: ${cuenta.importadas} importados, ${cuenta.omitidas} omitidos, ${cuenta.rechazadas} rechazados (de ${cuenta.archivos} archivos).`);
} catch (e) {
  // Caída a medias: se deja un evento de error (sin datos) y se sale con código 1.
  console.error("Importación interrumpida:", errorSeguro(e));
  for (const e of ejecuciones.values()) anotarInterrupcion(e.cuenta);
  try { await cerrarEjecuciones(); } catch { /* si no se puede cerrar, queda «sin terminar» en el panel */ }
  try {
    await registrarEvento(db, { componente: "importador", accion: "importar-datos", resultado: "error", duracion_ms: Date.now() - inicio, detalle: cuenta });
  } catch { /* si ni siquiera se puede registrar, ya hemos avisado por consola */ }
  process.exitCode = 1;
} finally {
  await db.end();
}
if (cuenta.rechazadas > 0) process.exitCode = 1;
