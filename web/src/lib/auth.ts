// Acceso (bloque 4): contraseñas, tokens de sesión y comprobaciones de Google. Solo funciones puras o de `node:crypto`:
// sin base de datos ni Next, para poder probarlas con tests deterministas.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// ---- Correo y contraseña --------------------------------------------------------------------------

/** Correo en minúsculas y sin espacios, o null si no parece un correo. No se envía nada: solo identifica la cuenta. */
export function normalizarEmail(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const e = s.trim().toLowerCase();
  if (e.length < 3 || e.length > 254 || /\s/.test(e)) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export const CONTRASENA_MIN = 12;
export const CONTRASENA_MAX = 128; // tope: scrypt con un texto enorme sería un modo barato de saturar el servidor

/** Motivo por el que la contraseña no vale, o null. Largo (NIST 800-63B) en vez de «un símbolo y un número». */
export function problemaContrasena(pw: unknown, email: string | null): string | null {
  if (typeof pw !== "string") return "Escribe una contraseña.";
  if (pw.length < CONTRASENA_MIN) return `La contraseña debe tener al menos ${CONTRASENA_MIN} caracteres.`;
  if (pw.length > CONTRASENA_MAX) return `La contraseña no puede pasar de ${CONTRASENA_MAX} caracteres.`;
  if (email && pw.toLowerCase().includes(email.split("@")[0]) && email.split("@")[0].length >= 4) {
    return "La contraseña no puede contener tu correo.";
  }
  if (/^(.)\1+$/.test(pw)) return "La contraseña no puede ser un solo carácter repetido.";
  return null;
}

const N = 2 ** 15, R = 8, P = 1, LARGO = 64;
const MAXMEM = 128 * N * R * 2; // scrypt necesita 128·N·r bytes; el doble de margen

function derivar(pw: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((res, rej) => scrypt(pw.normalize("NFKC"), sal, LARGO, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? rej(e) : res(k))));
}

/** Hash `scrypt$N$r$p$sal$hash` (base64url): lleva sus parámetros, así se pueden subir más adelante sin romper las cuentas viejas. */
export async function hashContrasena(pw: string): Promise<string> {
  const sal = randomBytes(16);
  const k = await derivar(pw, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64url")}$${k.toString("base64url")}`;
}

/** Comparación de tiempo constante. Un hash mal formado o con parámetros desmedidos devuelve false (nunca lanza). */
export async function verificarContrasena(pw: string, hash: string): Promise<boolean> {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m || typeof pw !== "string" || pw.length > CONTRASENA_MAX) return false;
  const [n, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (n > N || r > R || p > P || n < 2 ** 14 || (n & (n - 1)) !== 0) return false; // no más caro de lo que fijamos nosotras
  try {
    const esperado = Buffer.from(m[5], "base64url");
    const k = await derivar(pw, Buffer.from(m[4], "base64url"), n, r, p);
    return k.length === esperado.length && timingSafeEqual(k, esperado);
  } catch { return false; }
}

/** Hash de una contraseña que nadie conoce: se verifica contra él cuando el correo no existe, para que tardar lo mismo no delate qué correos hay. */
export const HASH_SENUELO = `scrypt$${N}$${R}$${P}$AAAAAAAAAAAAAAAAAAAAAA$${"A".repeat(86)}`;

export const LIMITE_FALLOS = 5;
export const BLOQUEO_MINUTOS = 15;

/** ¿Sigue bloqueada la cuenta? */
export function estaBloqueada(bloqueadaHasta: Date | null, ahora: Date): boolean {
  return bloqueadaHasta !== null && bloqueadaHasta.getTime() > ahora.getTime();
}

// ---- Identificadores y sesiones ---------------------------------------------------------------------

/** Id interno de una usuaria nueva (el que pide `^[a-z0-9_-]…`): `u` + 16 hex. El que va en las URLs es otro (`publico`). */
export const nuevoIdUsuaria = () => `u${randomBytes(8).toString("hex")}`;

/** Secreto de la cookie: 256 bits aleatorios. */
export const nuevoToken = () => randomBytes(32).toString("base64url");

/** En la base solo se guarda la huella del secreto, nunca el secreto. */
export const huella = (token: string) => createHash("sha256").update(token).digest("hex");

export const SESION_DIAS = 7;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Sesion = { usuaria_id: string; publico: string; rol: "usuaria" | "admin"; email: string; google: boolean };

/** ¿Los datos personales de esta URL son de quien tiene la sesión? Ni siquiera la administradora entra en los de otra persona. */
export function esDuena(sesion: Sesion | null, publicoDeLaUrl: string): boolean {
  return sesion !== null && UUID.test(publicoDeLaUrl) && sesion.publico === publicoDeLaUrl;
}

// ---- Entrar con Google (OAuth 2.0 con PKCE) --------------------------------------------------------

export const GOOGLE_AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

export const aleatorio = () => randomBytes(32).toString("base64url");
export const desafioPkce = (verificador: string) => createHash("sha256").update(verificador).digest("base64url");

export function urlGoogle(p: { clientId: string; redirectUri: string; estado: string; desafio: string; nonce: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId, redirect_uri: p.redirectUri, response_type: "code", scope: "openid email",
    state: p.estado, nonce: p.nonce, code_challenge: p.desafio, code_challenge_method: "S256", prompt: "select_account",
  });
  return `${GOOGLE_AUTORIZAR}?${q}`;
}

/** Compara dos textos en tiempo constante (el `state` de vuelta contra el guardado en la cookie). */
export function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** El id_token llega directo del servidor de Google por TLS, en la respuesta a nuestro intercambio de código (OIDC Core 3.1.3.7): se leen sus datos y se comprueban, sin pedir correo a nadie más. */
export function leerIdToken(idToken: unknown): Record<string, unknown> | null {
  if (typeof idToken !== "string") return null;
  const partes = idToken.split(".");
  if (partes.length !== 3) return null;
  try {
    const c = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
    return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : null;
  } catch { return null; }
}

export type ResultadoGoogle = { ok: true; sub: string; email: string } | { ok: false; motivo: string };

export function validarClaimsGoogle(c: Record<string, unknown> | null, esperado: { clientId: string; nonce: string; ahoraSeg: number }): ResultadoGoogle {
  if (!c) return { ok: false, motivo: "respuesta ilegible" };
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") return { ok: false, motivo: "emisor" };
  if (c.aud !== esperado.clientId) return { ok: false, motivo: "destinatario" };
  if (typeof c.exp !== "number" || c.exp <= esperado.ahoraSeg) return { ok: false, motivo: "caducado" };
  if (typeof c.nonce !== "string" || !iguales(c.nonce, esperado.nonce)) return { ok: false, motivo: "nonce" };
  if (typeof c.sub !== "string" || c.sub.length === 0 || c.sub.length > 255) return { ok: false, motivo: "sin identificador" };
  if (c.email_verified !== true) return { ok: false, motivo: "correo sin verificar" };
  const email = normalizarEmail(c.email);
  if (!email) return { ok: false, motivo: "sin correo" };
  return { ok: true, sub: c.sub, email };
}
