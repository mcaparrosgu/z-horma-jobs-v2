// Piezas puras para registrar cada ejecución de ingesta (tablas `fuentes` y `ejecuciones_ingesta`).
// Sin acceso a disco ni a red: se prueban con `npm test`.
import { validar } from "./esquemas.ts";
import { validarFuente } from "./fuentes.ts";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const MAX_ERRORES = 20;

/**
 * Lee endpoints.json (ya leído de disco) y devuelve las fuentes por nombre.
 * Si no cumple su esquema devuelve un mapa vacío: sin fuente registrada no se registra ejecución.
 */
export function fuentesDeEndpoints(endpoints: unknown): Map<string, Json> {
  const r = validar<{ fuentes: Json[] }>("endpoints", endpoints);
  if (!r.ok) return new Map();
  // Mismas comprobaciones que el formulario de /fuentes (https, hosts internos, credenciales, prefijo FUENTE_).
  // `{fecha}` es el hueco del adaptador del BOE: se sustituye solo para comprobar la URL.
  // El nombre se salta: la regla del formulario (sin espacios) no vale para los nombres de endpoints.json.
  const buenas = r.dato.fuentes.filter((f) => validarFuente({ ...f, nombre: "fuente", url: String(f.url).replace("{fecha}", "20240101") }).ok);
  return new Map(buenas.map((f) => [f.nombre as string, f]));
}

// A diferencia de SQL_GUARDAR_FUENTE (formulario), esta toma TODO de endpoints.json, licencia incluida.
export const SQL_SINCRONIZAR_FUENTE = `
  INSERT INTO fuentes (nombre, url, metodo, parametros, cabeceras, clave_env, clave_en, clave_nombre,
                       mapeo_campos, activa, licencia, atribucion, adaptador)
  VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
  ON CONFLICT (nombre) DO UPDATE SET
    url=EXCLUDED.url, metodo=EXCLUDED.metodo, parametros=EXCLUDED.parametros, cabeceras=EXCLUDED.cabeceras,
    clave_env=EXCLUDED.clave_env, clave_en=EXCLUDED.clave_en, clave_nombre=EXCLUDED.clave_nombre,
    mapeo_campos=EXCLUDED.mapeo_campos, activa=EXCLUDED.activa,
    licencia=EXCLUDED.licencia, atribucion=EXCLUDED.atribucion, adaptador=EXCLUDED.adaptador`;

export function paramsSincronizarFuente(f: Json): unknown[] {
  return [
    f.nombre, f.url, f.metodo, JSON.stringify(f.parametros ?? {}), JSON.stringify(f.cabeceras ?? {}),
    f.clave_env ?? null, f.clave_en ?? null, f.clave_nombre ?? null, JSON.stringify(f.mapeo_campos),
    f.activa === true, f.licencia ?? null, f.atribucion ?? null, f.adaptador ?? null,
  ];
}

export const SQL_ABRIR_EJECUCION = `INSERT INTO ejecuciones_ingesta (fuente, inicio) VALUES ($1, now()) RETURNING id`;
export const SQL_CERRAR_EJECUCION = `
  UPDATE ejecuciones_ingesta SET fin = now(), entraron = $2, descartadas = $3, errores = $4::jsonb WHERE id = $1`;

export type CuentaEjecucion = { entraron: number; descartadas: number; errores: string[] };

export const cuentaVacia = (): CuentaEjecucion => ({ entraron: 0, descartadas: 0, errores: [] });

/**
 * Anota un archivo rechazado. Guarda cuántos rechazos van («archivo nº N», un contador: no localiza el archivo) y un motivo corto: nunca el nombre del archivo
 * (el nombre de una oferta puede llevar texto de la fuente) ni valores. El orden basta para localizarlo con el script.
 */
export function anotarRechazo(c: CuentaEjecucion, motivo: string): void {
  c.descartadas++;
  if (c.errores.length < MAX_ERRORES) c.errores.push(`archivo nº ${c.descartadas}: ${motivo.slice(0, 60)}`);
}

export function paramsCerrarEjecucion(id: number | string, c: CuentaEjecucion): unknown[] {
  return [id, c.entraron, c.descartadas, JSON.stringify(c.errores)];
}

/** Marca una ejecución como interrumpida: así el panel no la enseña como «correcta». */
export function anotarInterrupcion(c: CuentaEjecucion): void {
  if (c.errores.length < MAX_ERRORES) c.errores.push("importación interrumpida");
}
