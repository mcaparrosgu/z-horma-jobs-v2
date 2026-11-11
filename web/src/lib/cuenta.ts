// Lógica de «Mi cuenta» (bloque 1 de la construcción autónoma, RGPD): cambiar contraseña y comprobar si se puede
// borrar la cuenta propia. Funciones puras sobre una `Bd` (como acceso.ts), sin cookies ni Next: se prueban con una
// base falsa. El id de la usuaria siempre lo pone quien llama a partir de la SESIÓN, nunca de un formulario.
import { BLOQUEO_MINUTOS, LIMITE_FALLOS, estaBloqueada, problemaContrasena, verificarContrasena, hashContrasena } from "./auth.ts";
import type { Bd } from "./acceso.ts";

export type Resultado = { ok: true } | { ok: false; error: string };

const SQL_CUENTA = "SELECT hash, rol, email, fallos, bloqueada_hasta FROM cuentas WHERE usuaria_id = $1";
const ERROR_BLOQUEO = "Demasiados intentos: espera unos minutos.";

/**
 * Comprueba una contraseña con el MISMO contador de fallos que el login: si alguien con una sesión robada probara
 * contraseñas aquí, la cuenta se bloquea igual que al entrar (y el bloqueo vale también para entrar).
 */
async function verificarConBloqueo(bd: Bd, usuariaId: string, fila: Record<string, unknown>, hash: string, texto: string, ahora = new Date()): Promise<boolean | "bloqueada"> {
  const hasta = fila.bloqueada_hasta instanceof Date ? fila.bloqueada_hasta : null;
  if (estaBloqueada(hasta, ahora)) return "bloqueada";
  if (await verificarContrasena(texto, hash)) return true;
  await bd.query(
    `UPDATE cuentas SET fallos = fallos + 1,
       bloqueada_hasta = CASE WHEN fallos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueada_hasta END
     WHERE usuaria_id = $1`,
    [usuariaId, LIMITE_FALLOS, BLOQUEO_MINUTOS],
  );
  return false;
}

/** Cambia la contraseña tras comprobar la actual. No vale para cuentas solo-Google (no tienen hash). */
export async function cambiarContrasenaPropia(bd: Bd, usuariaId: string, actual: unknown, nueva: unknown): Promise<Resultado> {
  const fila = (await bd.query(SQL_CUENTA, [usuariaId])).rows[0];
  if (!fila) return { ok: false, error: "No se encuentra tu cuenta." };
  const hash = typeof fila.hash === "string" ? fila.hash : null;
  if (!hash) return { ok: false, error: "Entras con Google: no tienes contraseña que cambiar." };
  const buena = await verificarConBloqueo(bd, usuariaId, fila, hash, typeof actual === "string" ? actual : "");
  if (buena === "bloqueada") return { ok: false, error: ERROR_BLOQUEO };
  if (!buena) return { ok: false, error: "La contraseña actual no es correcta." };
  const problema = problemaContrasena(nueva, typeof fila.email === "string" ? fila.email : null);
  if (problema) return { ok: false, error: problema };
  await bd.query(
    "UPDATE cuentas SET hash = $2, fallos = 0, bloqueada_hasta = NULL WHERE usuaria_id = $1",
    [usuariaId, await hashContrasena(nueva as string)],
  );
  return { ok: true };
}

/**
 * ¿Puede borrarse esta cuenta? Nunca si es de administración. Si tiene contraseña, hay que escribirla; si solo
 * entra con Google (sin hash), hay que escribir su correo exactamente, para que borrar no sea un solo clic.
 */
export async function puedeBorrarCuenta(bd: Bd, usuariaId: string, confirmacion: unknown): Promise<Resultado> {
  const fila = (await bd.query(SQL_CUENTA, [usuariaId])).rows[0];
  if (!fila) return { ok: false, error: "No se encuentra tu cuenta." };
  if (fila.rol === "admin") return { ok: false, error: "La cuenta de administración no se borra desde la web." };
  const hash = typeof fila.hash === "string" ? fila.hash : null;
  const texto = typeof confirmacion === "string" ? confirmacion : "";
  if (hash) {
    const buena = await verificarConBloqueo(bd, usuariaId, fila, hash, texto);
    if (buena === "bloqueada") return { ok: false, error: ERROR_BLOQUEO };
    if (!buena) return { ok: false, error: "La contraseña no es correcta." };
  } else if (texto.trim().toLowerCase() !== String(fila.email).toLowerCase()) {
    return { ok: false, error: "Escribe tu correo exactamente para confirmar." };
  }
  return { ok: true };
}
