// Entrevista única: respuestas de la usuaria guardadas en su perfil (perfiles.respuestas, migración 034).
// Validación en la frontera: la web guarda su texto tal cual, con tema, fecha de hoy y los mismos límites que el esquema perfil.
// El texto es DATO: si parece una orden a una IA no se guarda (lo leerán agentes en cada carta).
import { detectarInstrucciones } from "./instrucciones-embebidas.ts";

export type Respuesta = { tema: string; texto: string; fecha: string };
export const MAX_RESPUESTAS = 60;
export const MAX_TEMA = 120;
export const MAX_TEXTO = 1500;

export type ResultadoRespuesta = { ok: true; respuesta: Respuesta } | { ok: false; error: string };

const hoyISO = () => new Date().toISOString().slice(0, 10);

export function validarRespuesta(tema: unknown, texto: unknown, hoy: string = hoyISO()): ResultadoRespuesta {
  const t = typeof tema === "string" ? tema.replace(/\s+/g, " ").trim() : "";
  const x = typeof texto === "string" ? texto.replace(/\r\n/g, "\n").trim() : "";
  if (!t) return { ok: false, error: "Escribe de qué trata (por ejemplo: «Qué valoro en un trabajo»)." };
  if (t.length > MAX_TEMA) return { ok: false, error: `El tema admite hasta ${MAX_TEMA} caracteres.` };
  if (!x) return { ok: false, error: "Escribe tu respuesta." };
  if (x.length > MAX_TEXTO) return { ok: false, error: `La respuesta admite hasta ${MAX_TEXTO} caracteres (ahora ${x.length}).` };
  if (detectarInstrucciones([t, x]).length > 0) {
    return { ok: false, error: "Ese texto parece una orden dirigida a una IA, no una respuesta tuya. Cuéntalo con tus palabras." };
  }
  return { ok: true, respuesta: { tema: t, texto: x, fecha: hoy } };
}

// No tocan `actualizado_en`: la web solo tiene permiso sobre la columna `respuestas` (migración 034).
/** Añade al final. El tope de 60 lo impone también la base (CHECK de la migración 034). */
export const SQL_AGREGAR_RESPUESTA = `
  UPDATE perfiles SET respuestas = respuestas || $2::jsonb WHERE usuaria_id = $1 AND NOT respuestas @> $2::jsonb`;

/**
 * Borra por valor (no por posición): si dos pestañas borran a la vez, no se quita otra respuesta distinta.
 * Los saltos de línea se comparan como `\n`: al enviar un formulario el navegador los convierte en `\r\n`, y sin esto
 * una respuesta de varias líneas no se encontraba y «Borrar» no hacía nada, sin avisar.
 */
export const SQL_BORRAR_RESPUESTA = `
  UPDATE perfiles SET
    respuestas = COALESCE((SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(respuestas) WITH ORDINALITY AS t(e, o)
      WHERE jsonb_build_object('tema', e->>'tema', 'texto', replace(e->>'texto', E'\\r\\n', E'\\n'), 'fecha', e->>'fecha') <> $2::jsonb), '[]'::jsonb)
  WHERE usuaria_id = $1`;

export const paramsAgregar = (uid: string, r: Respuesta): unknown[] => [uid, JSON.stringify([r])];
export const paramsBorrar = (uid: string, r: Respuesta): unknown[] => [uid, JSON.stringify({ ...r, texto: r.texto.replace(/\r\n/g, "\n") })];

const fechaReal = (f: string) => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`); // una fecha imposible (2026-13-45) da «Invalid Date» y toISOString lanzaría
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
};

/** Lo que llega de la base o de un formulario, reducido a una `Respuesta` válida; null si no lo es. */
export function comoRespuesta(v: unknown): Respuesta | null {
  if (!v || typeof v !== "object") return null;
  const { tema, texto, fecha } = v as Record<string, unknown>;
  if (typeof tema !== "string" || typeof texto !== "string" || typeof fecha !== "string") return null;
  if (!fechaReal(fecha) || !tema.trim() || !texto.trim() || tema.length > MAX_TEMA || texto.length > MAX_TEXTO) return null;
  return { tema, texto, fecha };
}

/** Respuestas que traen los archivos al importar (perfil.json): solo las de forma válida y sin órdenes a una IA; el resto se descarta. */
export function respuestasImportables(v: unknown): Respuesta[] {
  if (!Array.isArray(v)) return [];
  return v.map(comoRespuesta).filter((x): x is Respuesta => x !== null && detectarInstrucciones([x.tema, x.texto]).length === 0).slice(0, MAX_RESPUESTAS);
}

/** Respuestas del disco que la base aún no tiene (igualdad por valor), ya validadas. Se comparan con TODO lo que hay en la base, válido o no. */
export function nuevasDelDisco(base: unknown, disco: unknown): Respuesta[] {
  const clave = (r: Respuesta) => JSON.stringify([r.tema, r.texto, r.fecha]);
  const vistas = new Set((Array.isArray(base) ? base : []).map(comoRespuesta).filter((x): x is Respuesta => x !== null).map(clave));
  return respuestasImportables(disco).filter((x) => !vistas.has(clave(x)));
}
