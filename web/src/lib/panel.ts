// Datos de la portada (panel). Solo lectura: muestra el estado y los comandos que hay que lanzar, no ejecuta nada.

export type Flujo = { letra: string; nombre: string; comando: string; hace: string };

// Fuente: la cadena de comandos de «Pipeline» en CLAUDE.md. Si cambia un comando, se cambia aquí y en ese documento.
export const FLUJOS: readonly Flujo[] = [
  { letra: "A′", nombre: "Calificar fuentes", comando: "/calificar-fuentes", hace: "Decide si un portal se puede usar como fuente" },
  { letra: "A", nombre: "Ingesta de ofertas", comando: "/ingestar-ofertas · /publicar-oferta", hace: "Trae y procesa ofertas de una fuente calificada, o las publica una empresa" },
  { letra: "B", nombre: "Perfil", comando: "/perfilar", hace: "CV → perfil, CV maestro, preferencias y CV base por sector" },
  { letra: "C", nombre: "Recomendación", comando: "/recomendar", hace: "Ofertas recomendadas con nota y explicación" },
  { letra: "D", nombre: "Candidatura", comando: "/candidatura", hace: "CV y carta para una oferta, con verificador y juez" },
  { letra: "E", nombre: "Aprobación y envío", comando: "/aprobar → /marcar-enviada", hace: "La usuaria aprueba y anota el envío" },
] as const;

export const SQL_PANEL_FUENTES = `
  SELECT f.nombre, f.activa, f.licencia, f.adaptador,
         u.inicio AS ultima_inicio, u.fin AS ultima_fin, u.entraron AS ultima_entraron,
         u.descartadas AS ultima_descartadas, jsonb_array_length(u.errores) AS ultima_errores
  FROM fuentes f
  LEFT JOIN LATERAL (SELECT * FROM ejecuciones_ingesta e WHERE e.fuente = f.nombre ORDER BY e.inicio DESC LIMIT 1) u ON true
  ORDER BY f.nombre`;

export const SQL_PANEL_POR_FUENTE = `SELECT fuente AS clave, count(*)::int AS n FROM ofertas GROUP BY fuente ORDER BY n DESC, fuente`;
export const SQL_PANEL_POR_PAIS = `SELECT COALESCE(pais, 'sin país') AS clave, count(*)::int AS n FROM ofertas GROUP BY 1 ORDER BY n DESC, 1`;
export const SQL_PANEL_POR_LICENCIA = `SELECT COALESCE(licencia, 'sin licencia indicada') AS clave, count(*)::int AS n FROM ofertas GROUP BY 1 ORDER BY n DESC, 1`;
export const SQL_PANEL_TOTALES = `
  SELECT (SELECT count(*) FROM ofertas)::int AS ofertas, (SELECT count(*) FROM usuarias)::int AS usuarias`;
// Los perfiles y preferencias de las candidatas NO se tocan desde el panel (línea roja: preferencias.test.ts).

export type Conteo = { clave: string; n: number };

/** Anchura (0–100 %) de una barra respecto al mayor conteo. Nunca negativa ni mayor que 100. */
export function anchoBarra(n: number, maximo: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(maximo) || maximo <= 0 || n <= 0) return 0;
  return Math.min(100, Math.round((n / maximo) * 100));
}

export type EstadoFuente = "sin ejecutar" | "sin terminar" | "abandonada" | "con errores" | "correcta";

/** Una ejecución sin cierre que lleva más de estas horas se da por abandonada (el proceso murió de golpe). */
export const HORAS_ABANDONADA = 6;

export function estadoEjecucion(
  u: { ultima_inicio: Date | null; ultima_fin: Date | null; ultima_errores: number | null },
  ahora: Date = new Date(),
): EstadoFuente {
  if (!u.ultima_inicio) return "sin ejecutar";
  if (!u.ultima_fin) {
    return ahora.getTime() - u.ultima_inicio.getTime() > HORAS_ABANDONADA * 3_600_000 ? "abandonada" : "sin terminar";
  }
  return (u.ultima_errores ?? 0) > 0 ? "con errores" : "correcta";
}
