// Acceso de empresas (bloque 3, portal de empresas): identidad APARTE de las usuarias, tabla propia
// (`cuentas_empresa`, migración 018). No hay registro público ni Google: el alta es solo por terminal
// (`npm run cuenta-empresa`, modo piloto). Reutiliza las piezas puras de auth.ts (hash, bloqueo, correo).
import { BLOQUEO_MINUTOS, HASH_SENUELO, LIMITE_FALLOS, estaBloqueada, normalizarEmail, verificarContrasena } from "./auth.ts";
import type { Bd } from "./acceso.ts";

export type EntradaEmpresa = { ok: true; empresa_id: string } | { ok: false; error: string };
export const ERROR_ENTRAR_EMPRESA = "Correo o contraseña incorrectos, o demasiados intentos: espera unos minutos.";

const SQL_CUENTA_EMPRESA_POR_EMAIL = "SELECT empresa_id, hash, fallos, bloqueada_hasta FROM cuentas_empresa WHERE email = $1";

export async function entrarConContrasenaEmpresa(bd: Bd, emailCrudo: unknown, pw: unknown, ahora = new Date()): Promise<EntradaEmpresa> {
  const email = normalizarEmail(emailCrudo);
  const texto = typeof pw === "string" ? pw : "";
  const fila = email ? (await bd.query(SQL_CUENTA_EMPRESA_POR_EMAIL, [email])).rows[0] : undefined;
  const hash = typeof fila?.hash === "string" ? fila.hash : null;
  // Siempre se hace una verificación, exista o no la cuenta (contra un hash señuelo si no existe): tarda igual.
  const buena = await verificarContrasena(texto, hash ?? HASH_SENUELO);
  if (!fila || !hash) return { ok: false, error: ERROR_ENTRAR_EMPRESA };
  const hasta = fila.bloqueada_hasta instanceof Date ? fila.bloqueada_hasta : null;
  if (estaBloqueada(hasta, ahora)) return { ok: false, error: ERROR_ENTRAR_EMPRESA };
  if (!buena) {
    await bd.query(
      `UPDATE cuentas_empresa SET fallos = fallos + 1,
         bloqueada_hasta = CASE WHEN fallos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueada_hasta END
       WHERE empresa_id = $1`,
      [fila.empresa_id, LIMITE_FALLOS, BLOQUEO_MINUTOS],
    );
    return { ok: false, error: ERROR_ENTRAR_EMPRESA };
  }
  await bd.query("UPDATE cuentas_empresa SET fallos = 0, bloqueada_hasta = NULL WHERE empresa_id = $1", [fila.empresa_id]);
  return { ok: true, empresa_id: String(fila.empresa_id) };
}
