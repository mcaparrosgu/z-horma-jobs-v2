// Piezas de la página /salud. Solo lectura: junta señales que ya existen (base de datos, eventos, ejecuciones,
// evals) en un semáforo por pieza. No ejecuta nada y nunca devuelve valores de campos: solo recuentos, ids y fechas.
import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { estadoEjecucion, type EstadoFuente } from "./panel.ts";

export type Semaforo = "verde" | "ambar" | "rojo" | "gris";
export type Pieza = { nombre: string; estado: Semaforo; motivo: string };

export const DIAS_VENTANA = 7;
const MS_DIA = 86_400_000;

/** Orden de gravedad: sirve para resumir muchas piezas en un solo color. */
const GRAVEDAD: Record<Semaforo, number> = { gris: 0, verde: 1, ambar: 2, rojo: 3 };
export function peor(estados: Semaforo[]): Semaforo {
  return estados.reduce<Semaforo>((a, b) => (GRAVEDAD[b] > GRAVEDAD[a] ? b : a), "gris");
}

// --- Base de datos -----------------------------------------------------------------------------
export const SQL_MIGRACIONES = `SELECT count(*)::int AS aplicadas, max(nombre) AS ultima FROM migraciones_aplicadas`;

export function piezaBaseDatos(aplicadas: number | null, enDisco: number): Pieza {
  if (aplicadas === null) return { nombre: "Base de datos", estado: "rojo", motivo: "No responde. ¿Está arrancado el contenedor horma-db?" };
  if (aplicadas < enDisco) return { nombre: "Base de datos", estado: "ambar", motivo: `Faltan ${enDisco - aplicadas} migraciones por aplicar (npm run migrar).` };
  return { nombre: "Base de datos", estado: "verde", motivo: `Responde y tiene las ${aplicadas} migraciones aplicadas.` };
}

/** Cuántos archivos .sql de migración hay en web/db/migraciones. */
export function migracionesEnDisco(dir: string): number {
  try { return readdirSync(dir).filter((f) => f.endsWith(".sql")).length; } catch { return 0; }
}

// --- Eventos por componente (tabla eventos) ----------------------------------------------------
export const SQL_EVENTOS = `
  SELECT componente,
         max(ts) AS ultimo,
         (array_agg(resultado ORDER BY ts DESC))[1] AS ultimo_resultado,
         count(*) FILTER (WHERE ts > now() - make_interval(days => ${DIAS_VENTANA}))::int AS recientes,
         count(*) FILTER (WHERE ts > now() - make_interval(days => ${DIAS_VENTANA}) AND resultado = 'error')::int AS errores
  FROM eventos GROUP BY componente ORDER BY componente`;

export type FilaEventos = { componente: string; ultimo: Date; ultimo_resultado: string; recientes: number; errores: number };

export function piezaEventos(f: FilaEventos): Pieza {
  const base = `${f.recientes} ${f.recientes === 1 ? "evento" : "eventos"} en ${DIAS_VENTANA} días, ${f.errores} con error.`;
  if (f.ultimo_resultado === "error") return { nombre: f.componente, estado: "rojo", motivo: `El último evento fue un error. ${base}` };
  if (f.errores > 0) return { nombre: f.componente, estado: "ambar", motivo: `Hubo errores, pero el último evento fue correcto. ${base}` };
  return { nombre: f.componente, estado: "verde", motivo: base };
}

// --- Ingesta (una pieza por fuente) --------------------------------------------------------------
export type FilaFuente = {
  nombre: string; activa: boolean;
  ultima_inicio: Date | null; ultima_fin: Date | null; ultima_errores: number | null;
};

const ESTADO_INGESTA: Record<EstadoFuente, { estado: Semaforo; motivo: string }> = {
  "correcta": { estado: "verde", motivo: "La última ejecución terminó sin errores." },
  "con errores": { estado: "rojo", motivo: "La última ejecución terminó con errores (mira Ejecuciones)." },
  "abandonada": { estado: "rojo", motivo: "La última ejecución no se cerró hace horas: el proceso murió a medias." },
  "sin terminar": { estado: "ambar", motivo: "Hay una ejecución sin cerrar (puede estar en curso)." },
  "sin ejecutar": { estado: "gris", motivo: "Todavía no se ha ejecutado." },
};

export function piezaFuente(f: FilaFuente, ahora: Date = new Date()): Pieza {
  if (!f.activa) return { nombre: `Fuente · ${f.nombre}`, estado: "gris", motivo: "Apagada en endpoints.json: no se trae." };
  return { nombre: `Fuente · ${f.nombre}`, ...ESTADO_INGESTA[estadoEjecucion(f, ahora)] };
}

// --- Calidad de las ofertas guardadas ------------------------------------------------------------
export const SQL_CALIDAD_OFERTAS = `
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE sector IS NULL)::int AS sin_sector,
         count(*) FILTER (WHERE familia IS NULL)::int AS sin_familia,
         count(*) FILTER (WHERE licencia IS NULL)::int AS sin_licencia,
         count(*) FILTER (WHERE avisos IS NOT NULL AND jsonb_typeof(avisos) = 'array' AND jsonb_array_length(avisos) > 0)::int AS con_avisos
  FROM ofertas
  WHERE id NOT LIKE 'of-prueba-%'`; // las dos ofertas de prueba no cuentan (mismo criterio que npm run verificar)

export type CalidadOfertas = { total: number; sin_sector: number; sin_familia: number; sin_licencia: number; con_avisos: number };

export function piezaOfertas(c: CalidadOfertas): Pieza {
  if (c.total === 0) return { nombre: "Ofertas guardadas", estado: "gris", motivo: "Todavía no hay ofertas." };
  // Sin licencia no debería haber ninguna: el script no ingesta sin ella.
  if (c.sin_licencia > 0) return { nombre: "Ofertas guardadas", estado: "rojo", motivo: `${c.sin_licencia} de ${c.total} no tienen licencia de origen.` };
  const huecos = c.sin_sector + c.sin_familia;
  if (huecos > 0) {
    return { nombre: "Ofertas guardadas", estado: "ambar", motivo: `${c.total} ofertas; ${c.sin_sector} sin sector y ${c.sin_familia} sin familia (¿falta ampliar la taxonomía?). ${c.con_avisos} con avisos.` };
  }
  return { nombre: "Ofertas guardadas", estado: "verde", motivo: `${c.total} ofertas, todas con sector, familia y licencia. ${c.con_avisos} con avisos.` };
}

// --- Última verificación (evento «verificador») ----------------------------------------------------
export const SQL_ULTIMA_VERIFICACION = `
  SELECT ts, resultado, detalle FROM eventos WHERE componente = 'verificador' ORDER BY ts DESC LIMIT 1`;

export type FilaVerificacion = { ts: Date; resultado: string; detalle: { coinciden?: number; fallos?: number; avisos?: number } };

export function piezaVerificacion(v: FilaVerificacion | null, ahora: Date = new Date()): Pieza {
  const nombre = "Verificación archivos ↔ base";
  if (!v) return { nombre, estado: "gris", motivo: "Nunca se ha corrido npm run verificar." };
  const d = v.detalle ?? {};
  if (v.resultado === "error" || (d.fallos ?? 0) > 0) return { nombre, estado: "rojo", motivo: `La última verificación encontró ${d.fallos ?? "algunos"} fallos. Corre npm run verificar para ver cuáles.` };
  const dias = Math.floor((ahora.getTime() - v.ts.getTime()) / MS_DIA);
  if (dias > DIAS_VENTANA) return { nombre, estado: "ambar", motivo: `Cuadraba, pero hace ${dias} días. Vuelve a correr npm run verificar.` };
  return { nombre, estado: "verde", motivo: `Todo cuadraba (${d.coinciden ?? 0} ofertas coinciden).` };
}

// --- Evals (último resultado guardado en evals/resultados) -----------------------------------------
export type ResumenEvals = { archivo: string; fecha: string; conjuntos: { nombre: string; total: number; ok: number }[]; ilegible?: boolean };

const MAX_BYTES_EVAL = 2_000_000;
const NOMBRE_EVAL = /^(\d{4}-\d{2}-\d{2})-codigo\.json$/;

/** Cuenta casos buenos por conjunto. Lo que no tenga la forma esperada se ignora (nunca lanza). */
export function resumirEvals(json: unknown): ResumenEvals["conjuntos"] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  return Object.entries(json as Record<string, unknown>)
    .filter(([, casos]) => Array.isArray(casos))
    .map(([nombre, casos]) => {
      const lista = (casos as unknown[]).filter((c) => c && typeof c === "object") as { ok?: unknown }[];
      return { nombre, total: lista.length, ok: lista.filter((c) => c.ok === true).length };
    });
}

/** Lee el resultado de evals más reciente (por la fecha del nombre). Null si no hay o no se puede leer. */
export function leerUltimosEvals(dir: string): ResumenEvals | null {
  try {
    if (!existsSync(dir)) return null;
    const nombres = readdirSync(dir).filter((f) => NOMBRE_EVAL.test(f)).sort();
    for (const archivo of nombres.reverse()) {
      const ruta = join(dir, archivo);
      const st = lstatSync(ruta);
      if (!st.isFile() || st.size > MAX_BYTES_EVAL) continue;
      return { archivo, fecha: NOMBRE_EVAL.exec(archivo)![1], conjuntos: resumirEvals(JSON.parse(readFileSync(ruta, "utf8"))) };
    }
  } catch { return { archivo: "", fecha: "", conjuntos: [], ilegible: true }; } // existe pero no se puede leer: no es lo mismo que «no hay»
  return null;
}

export function piezaEvals(r: ResumenEvals | null, ahora: Date = new Date()): Pieza {
  const nombre = "Evals de código (pista A)";
  if (r?.ilegible) return { nombre, estado: "ambar", motivo: "El último archivo de resultados existe pero no se puede leer (¿corrupto?). Vuelve a correr los evals." };
  if (!r || r.conjuntos.length === 0) return { nombre, estado: "gris", motivo: "No hay resultados guardados. Corre python -I evals/correr_evals.py." };
  const total = r.conjuntos.reduce((n, c) => n + c.total, 0);
  const ok = r.conjuntos.reduce((n, c) => n + c.ok, 0);
  if (ok < total) {
    const malos = r.conjuntos.filter((c) => c.ok < c.total).map((c) => c.nombre).join(", ");
    return { nombre, estado: "rojo", motivo: `${total - ok} de ${total} casos fallan (${malos}) en ${r.archivo}.` };
  }
  const dias = Math.floor((ahora.getTime() - Date.parse(`${r.fecha}T00:00:00Z`)) / MS_DIA);
  if (dias > DIAS_VENTANA) return { nombre, estado: "ambar", motivo: `${ok} de ${total} en verde, pero hace ${dias} días (${r.archivo}). Vuelve a correrlos.` };
  return { nombre, estado: "verde", motivo: `${ok} de ${total} casos en verde (${r.archivo}).` };
}
