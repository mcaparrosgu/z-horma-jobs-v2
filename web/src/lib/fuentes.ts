// Validación de una fuente (portal de ofertas) antes de guardarla. Sin acceso a la base ni al disco.
// Hallazgos del revisor: (a) toda escritura pasa por validar(); (d) una fuente no puede guardar claves;
// (i) los mensajes de error no repiten el contenido de claves de nombre libre.
import { validar } from "./esquemas.ts";

export type Fuente = {
  nombre: string;
  url: string;
  metodo: "GET";
  parametros: Record<string, string>;
  cabeceras: Record<string, string>;
  clave_env: string | null;
  clave_en: "cabecera" | "parametro" | null;
  clave_nombre: string | null;
  mapeo_campos: Record<string, string>;
  activa: boolean;
};

export type ResultadoFuente = { ok: true; fuente: Fuente } | { ok: false; errores: string[] };

const NOMBRE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;
// Solo variables con prefijo FUENTE_: una fuente nunca puede pedir HORMA_DB_PASSWORD u otra variable ajena.
const VAR_ENTORNO = /^FUENTE_[A-Z0-9_]{2,54}$/;
const NOMBRE_CLAVE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
// Nombres de cabecera y de parámetro que casi siempre llevan una credencial.
const CABECERA_SECRETA = /^(authorization|proxy-authorization|cookie|set-cookie)$|key|token|secret|auth|passw/i;
const PARAMETRO_SECRETO = /key|token|secret|auth|pass|pwd|sig|jwt|sid|session|credential/i;
// Nombres legítimos que contienen una palabra sospechosa (keywords, author…).
const NOMBRE_INOFENSIVO = /^(keywords?|author|authors|signal|design|assign\w*|sidebar)$/i;
// Valores con pinta de credencial: prefijos conocidos o una cadena larga sin espacios.
const VALOR_SECRETO = /^(bearer|basic|token)\s|^(sk|pk|ghp|gho|xox[bap])[-_]|^AKIA[A-Z0-9]{16}|^[A-Za-z0-9_\-+/=.:~@!%]{32,}$/i;
// Cadena larga sin espacios que mezcla letras y cifras (no una fecha): probablemente una clave.
const parecePicada = (v: string) => v.length >= 20 && !/\s/.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v) && !/^\d{4}-\d{2}-\d{2}/.test(v);
export const pareceCredencial = (v: string) => VALOR_SECRETO.test(v) || parecePicada(v);
// IPs y nombres internos: se rechazan al guardar (la comprobación tras resolver el DNS se hará al descargar).
const HOST_INTERNO = /^(localhost|.*\.(local|localhost|internal|lan|home|corp))$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function hostInterno(h: string): boolean {
  if (h.startsWith("[") || HOST_INTERNO.test(h) || !h.includes(".")) return true;
  const m = IPV4.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

const limpiaRuta = (ruta: string) => ruta.replace(/\/(parametros|cabeceras|mapeo_campos)\/.*/, "/$1/(clave)");

function revisaMapa(mapa: Record<string, string>, quien: string, nombreSecreto: RegExp | null, errores: string[]) {
  for (const [k, v] of Object.entries(mapa)) {
    // Nunca se repite el nombre ni el valor en el mensaje: podrían ser la propia clave.
    if (nombreSecreto?.test(k) && !NOMBRE_INOFENSIVO.test(k)) errores.push(`${quien}: hay un nombre que parece una credencial; la clave va en clave_env`);
    if (typeof v === "string" && pareceCredencial(v)) errores.push(`${quien}: hay un valor que parece una credencial; la clave va en clave_env`);
  }
}

// Mismo criterio que PROHIBIDAS en ingestar.py: el dominio y sus subdominios, y cualquier «indeed.»
export function hostProhibido(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return ["linkedin.com", "indeed.com"].some((d) => h === d || h.endsWith("." + d)) || h.includes("indeed.");
}

/** Comprueba una fuente que viene de un formulario. Devuelve errores en llano, sin repetir valores. */
export function validarFuente(entrada: unknown): ResultadoFuente {
  const errores: string[] = [];
  const f = (entrada ?? {}) as Partial<Fuente>;

  if (typeof f.nombre !== "string" || !NOMBRE.test(f.nombre)) {
    errores.push("nombre: letras, números, guion y guion bajo (máximo 60)");
  }
  if (typeof f.url !== "string") {
    errores.push("url: obligatoria");
  } else {
    let u: URL | null = null;
    try { u = new URL(f.url); } catch { errores.push("url: no es una dirección válida"); }
    if (u) {
      if (u.protocol !== "https:") errores.push("url: solo https");
      if (f.url.length > 2000) errores.push("url: demasiado larga");
      if (hostProhibido(u.hostname)) errores.push("url: LinkedIn e Indeed no son fuente de ofertas (regla del producto)");
      if (u.port && u.port !== "443") errores.push("url: solo el puerto 443");
      if (hostInterno(u.hostname)) errores.push("url: no se admiten direcciones internas (localhost, IP privadas, sin punto)");
      if (u.pathname.split("/").some((s) => s && pareceCredencial(s))) errores.push("url: un tramo de la ruta parece una credencial; la clave va en clave_env");
      if (u.username || u.password) errores.push("url: no puede llevar usuario ni contraseña");
      if (u.search || u.hash) errores.push("url: sin parámetros; van en el campo «parámetros»");
    }
  }
  if (f.clave_env != null) {
    if (typeof f.clave_env !== "string" || !VAR_ENTORNO.test(f.clave_env)) {
      errores.push("clave_env: es el NOMBRE de una variable que empieza por FUENTE_ (por ejemplo FUENTE_ADZUNA_KEY), nunca la clave");
    }
    if (f.clave_en !== "cabecera" && f.clave_en !== "parametro") errores.push("clave_en: indica si la clave va en cabecera o en parámetro");
    if (typeof f.clave_nombre !== "string" || !NOMBRE_CLAVE.test(f.clave_nombre)) errores.push("clave_nombre: nombre de la cabecera o del parámetro");
  } else if (f.clave_en || f.clave_nombre) {
    errores.push("clave_en y clave_nombre solo tienen sentido con clave_env");
  }

  const esMapa = (m: unknown): m is Record<string, string> => typeof m === "object" && m !== null && !Array.isArray(m);
  if (esMapa(f.parametros)) revisaMapa(f.parametros, "parámetros", PARAMETRO_SECRETO, errores);
  if (esMapa(f.cabeceras)) revisaMapa(f.cabeceras, "cabeceras", CABECERA_SECRETA, errores);
  if (esMapa(f.mapeo_campos)) revisaMapa(f.mapeo_campos, "mapeo_campos", null, errores);

  // El esquema de endpoints.json es el contrato compartido con los agentes.
  const candidata = {
    nombre: f.nombre, url: f.url, metodo: "GET", parametros: f.parametros, cabeceras: f.cabeceras,
    clave_env: f.clave_env ?? null,
    ...(f.clave_env ? { clave_en: f.clave_en, clave_nombre: f.clave_nombre } : {}),
    mapeo_campos: f.mapeo_campos, activa: f.activa === true,
  };
  const r = validar("endpoints", { fuentes: [candidata] });
  if (!r.ok) errores.push(...r.errores.map(limpiaRuta));

  const unicos = [...new Set(errores)];
  return unicos.length ? { ok: false, errores: unicos } : { ok: true, fuente: candidata as Fuente };
}

export const SQL_GUARDAR_FUENTE = `
  INSERT INTO fuentes (nombre, url, metodo, parametros, cabeceras, clave_env, clave_en, clave_nombre, mapeo_campos, activa)
  VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9::jsonb,$10)
  ON CONFLICT (nombre) DO UPDATE SET
    url=EXCLUDED.url, metodo=EXCLUDED.metodo, parametros=EXCLUDED.parametros, cabeceras=EXCLUDED.cabeceras,
    clave_env=EXCLUDED.clave_env, clave_en=EXCLUDED.clave_en, clave_nombre=EXCLUDED.clave_nombre,
    mapeo_campos=EXCLUDED.mapeo_campos, activa=EXCLUDED.activa`;

export function paramsFuente(f: Fuente): unknown[] {
  return [
    f.nombre, f.url, f.metodo, JSON.stringify(f.parametros), JSON.stringify(f.cabeceras),
    f.clave_env, f.clave_en ?? null, f.clave_nombre ?? null, JSON.stringify(f.mapeo_campos), f.activa,
  ];
}
