// Conexión a la base de datos para la web (solo servidor), con el rol restringido `horma_web` (migración 009). Un único pool que se reutiliza.
import pg from "pg";
import { problemaClave } from "./clave.ts";

const g = globalThis as unknown as { __hormaPool?: pg.Pool };

export function db(): pg.Pool {
  if (!g.__hormaPool) {
    const problema = problemaClave(process.env.HORMA_WEB_PASSWORD, "HORMA_WEB_PASSWORD");
    if (problema) throw new Error(problema);
    g.__hormaPool = new pg.Pool({
      host: "127.0.0.1", port: 5433, user: "horma_web", database: "horma",
      password: process.env.HORMA_WEB_PASSWORD, max: 5,
    });
  }
  return g.__hormaPool;
}

// --- Seguridad por filas (RLS, A3) -----------------------------------------------------------------------------------
// Las tablas con datos personales (perfiles, preferencias, matches, candidaturas, envios_empresa) tienen políticas que
// solo dejan ver las filas de la usuaria cuyo id está en `app.usuaria_id` (o, para envios_empresa, de la empresa cuyo id
// está en `app.empresa_id`). Sin esa variable no hay filas: falla cerrado. Es defensa en profundidad: aunque una consulta
// se equivoque de `usuaria_id`, la base no entrega filas ajenas. No sustituye a las comprobaciones de cada página.
// `set_config(..., true)` vale solo dentro de la transacción: al terminar, la conexión vuelve limpia al pool.
async function conVariable<T>(variable: "app.usuaria_id" | "app.empresa_id", id: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  if (typeof id !== "string" || id === "" || id.length > 200) throw new Error("falta el identificador para la consulta con RLS");
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config($1, $2, true)", [variable, id]);
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Ejecuta `fn` con la sesión de base de datos fijada a una usuaria (todo en una transacción). */
export const conUsuaria = <T>(usuariaId: string, fn: (c: pg.PoolClient) => Promise<T>) => conVariable("app.usuaria_id", usuariaId, fn);

/** Igual para una empresa: solo ve lo que sus candidatas le han enviado (envios_empresa). */
export const conEmpresa = <T>(empresaId: string, fn: (c: pg.PoolClient) => Promise<T>) => conVariable("app.empresa_id", empresaId, fn);

/** Para una transacción que ya abrió el llamador (p. ej. el envío a empresa): fija la usuaria dentro de ella. */
export async function fijarUsuaria(c: pg.PoolClient, usuariaId: string): Promise<void> {
  if (typeof usuariaId !== "string" || usuariaId === "" || usuariaId.length > 200) throw new Error("falta el identificador para la consulta con RLS");
  await c.query("SELECT set_config('app.usuaria_id', $1, true)", [usuariaId]);
}
