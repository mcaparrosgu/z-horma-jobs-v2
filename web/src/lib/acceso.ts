// Reglas de acceso (bloque 4) sobre la base de datos, sin cookies ni Next: devuelven a quién dejar entrar (o por qué no)
// y la acción crea la sesión. Así se pueden probar con una base falsa.
import {
  BLOQUEO_MINUTOS, HASH_SENUELO, LIMITE_FALLOS, estaBloqueada, hashContrasena, nuevoIdUsuaria,
  normalizarEmail, problemaContrasena, verificarContrasena,
} from "./auth.ts";

// OJO: registrarCuenta y entrarConGoogle abren una transacción, así que `bd` debe ser UN cliente (pool.connect()), no el pool.
export type Bd = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export type Entrada = { ok: true; usuaria_id: string } | { ok: false; error: string };

// El mismo mensaje para «no existe», «contraseña mala» y «bloqueada»: no se dice qué correos tienen cuenta.
export const ERROR_ENTRAR = "Correo o contraseña incorrectos, o demasiados intentos: espera unos minutos.";

const SQL_CUENTA_POR_EMAIL = "SELECT usuaria_id, hash, fallos, bloqueada_hasta FROM cuentas WHERE email = $1";

export async function entrarConContrasena(bd: Bd, emailCrudo: unknown, pw: unknown, ahora = new Date()): Promise<Entrada> {
  const email = normalizarEmail(emailCrudo);
  const texto = typeof pw === "string" ? pw : "";
  const fila = email ? (await bd.query(SQL_CUENTA_POR_EMAIL, [email])).rows[0] : undefined;
  const hash = typeof fila?.hash === "string" ? fila.hash : null;
  // Se hace SIEMPRE una verificación (contra un hash señuelo si no hay cuenta): tarda lo mismo exista o no el correo.
  const buena = await verificarContrasena(texto, hash ?? HASH_SENUELO);
  if (!fila || !hash) return { ok: false, error: ERROR_ENTRAR };
  const hasta = fila.bloqueada_hasta instanceof Date ? fila.bloqueada_hasta : null;
  if (estaBloqueada(hasta, ahora)) return { ok: false, error: ERROR_ENTRAR };
  if (!buena) {
    await bd.query(
      `UPDATE cuentas SET fallos = fallos + 1,
         bloqueada_hasta = CASE WHEN fallos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueada_hasta END
       WHERE usuaria_id = $1`,
      [fila.usuaria_id, LIMITE_FALLOS, BLOQUEO_MINUTOS],
    );
    return { ok: false, error: ERROR_ENTRAR };
  }
  await bd.query("UPDATE cuentas SET fallos = 0, bloqueada_hasta = NULL WHERE usuaria_id = $1", [fila.usuaria_id]);
  return { ok: true, usuaria_id: String(fila.usuaria_id) };
}

/** Cuenta nueva con correo y contraseña. El correo no se verifica (no hay servicio de correo): `email_verificado` queda en false. */
export async function registrarCuenta(bd: Bd, emailCrudo: unknown, pw: unknown): Promise<Entrada> {
  const email = normalizarEmail(emailCrudo);
  if (!email) return { ok: false, error: "Escribe un correo válido." };
  const problema = problemaContrasena(pw, email);
  if (problema) return { ok: false, error: problema };
  const id = nuevoIdUsuaria();
  const hash = await hashContrasena(pw as string);
  try {
    await bd.query("BEGIN");
    await bd.query("INSERT INTO usuarias (id) VALUES ($1)", [id]);
    await bd.query("INSERT INTO cuentas (usuaria_id, email, hash) VALUES ($1, $2, $3)", [id, email, hash]);
    await bd.query("COMMIT");
  } catch {
    await bd.query("ROLLBACK").catch(() => {});
    // Mismo texto sea cual sea el motivo: no se confirma qué correos están registrados.
    return { ok: false, error: "No se pudo crear la cuenta. Si ya tienes una, entra." };
  }
  return { ok: true, usuaria_id: id };
}

/** Entrar con Google. Google prueba que el correo es de quien entra, así que una cuenta de contraseña SIN verificar (que pudo crear
 *  otra persona con ese correo) pasa a ser de Google y pierde la contraseña. Las de administración no se unen solas. */
export async function entrarConGoogle(bd: Bd, sub: string, emailCrudo: string): Promise<Entrada> {
  const email = normalizarEmail(emailCrudo);
  if (!email) return { ok: false, error: "Google no devolvió un correo válido." };
  const porSub = (await bd.query("SELECT usuaria_id FROM cuentas WHERE google_sub = $1", [sub])).rows[0];
  if (porSub) return { ok: true, usuaria_id: String(porSub.usuaria_id) };

  const porEmail = (await bd.query("SELECT usuaria_id, email_verificado, google_sub, rol FROM cuentas WHERE email = $1", [email])).rows[0];
  if (porEmail) {
    // Una cuenta de administración nunca se une sola a Google (un Google con un correo reciclado entraría como admin).
    if (porEmail.google_sub !== null || porEmail.rol === "admin") {
      return { ok: false, error: "Ya hay una cuenta con ese correo que no se puede unir a Google. Entra con tu contraseña." };
    }
    // Google acaba de probar que el correo es de quien entra. Si la cuenta existente estaba SIN verificar, la creó alguien que
    // no lo probó (posible suplantación): se queda con Google, pierde esa contraseña y se cierran sus sesiones.
    if (porEmail.email_verificado !== true) {
      await bd.query("UPDATE cuentas SET google_sub = $2, email_verificado = true, hash = NULL, fallos = 0, bloqueada_hasta = NULL WHERE usuaria_id = $1 AND google_sub IS NULL", [porEmail.usuaria_id, sub]);
      await bd.query("DELETE FROM sesiones WHERE usuaria_id = $1", [porEmail.usuaria_id]);
    } else {
      await bd.query("UPDATE cuentas SET google_sub = $2 WHERE usuaria_id = $1 AND google_sub IS NULL", [porEmail.usuaria_id, sub]);
    }
    return { ok: true, usuaria_id: String(porEmail.usuaria_id) };
  }

  const id = nuevoIdUsuaria();
  try {
    await bd.query("BEGIN");
    await bd.query("INSERT INTO usuarias (id) VALUES ($1)", [id]);
    await bd.query("INSERT INTO cuentas (usuaria_id, email, google_sub, email_verificado) VALUES ($1, $2, $3, true)", [id, email, sub]);
    await bd.query("COMMIT");
  } catch {
    await bd.query("ROLLBACK").catch(() => {});
    return { ok: false, error: "No se pudo crear la cuenta con Google." };
  }
  return { ok: true, usuaria_id: id };
}
