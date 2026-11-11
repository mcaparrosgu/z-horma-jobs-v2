// Sesión en el servidor (bloque 4): crea, lee y cierra la sesión, y decide quién puede ver qué.
// La cookie lleva un secreto aleatorio; en la base solo está su huella. Ninguna página ni acción se fía del proxy:
// cada una llama a requerirSesion / requerirAdmin / requerirDuena (capa de acceso a datos).
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { huella, nuevoToken, SESION_DIAS, esDuena, type Sesion } from "./auth";
import { url_base } from "./url-base";

export { url_base };
// Secure siempre en producción (aunque falte o esté mal escrita HORMA_URL) y también si la dirección oficial es https.
const seguro = () => process.env.NODE_ENV === "production" || url_base().startsWith("https://");
export const COOKIE = "horma_sesion";

const SQL_SESION = `
  SELECT s.usuaria_id, u.publico::text AS publico, c.rol, c.email, (c.google_sub IS NOT NULL) AS google
  FROM sesiones s JOIN cuentas c ON c.usuaria_id = s.usuaria_id JOIN usuarias u ON u.id = s.usuaria_id
  WHERE s.huella = $1 AND s.caduca_en > now()`;

/** Abre una sesión nueva (siempre con un secreto nuevo: así no hay fijación de sesión) y pone la cookie. */
export async function crearSesion(usuariaId: string): Promise<void> {
  const token = nuevoToken();
  await db().query("DELETE FROM sesiones WHERE caduca_en < now()");
  await db().query(
    "INSERT INTO sesiones (huella, usuaria_id, caduca_en) VALUES ($1, $2, now() + make_interval(days => $3))",
    [huella(token), usuariaId, SESION_DIAS],
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: seguro(), path: "/", maxAge: SESION_DIAS * 24 * 3600,
  });
}

/** La sesión de esta petición, o null. Una sola consulta por petición. */
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const r = await db().query<Sesion>(SQL_SESION, [huella(token)]);
  return r.rows[0] ?? null;
});

export async function cerrarSesion(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token && token.length <= 200) await db().query("DELETE FROM sesiones WHERE huella = $1", [huella(token)]);
  jar.delete(COOKIE);
}

export async function requerirSesion(): Promise<Sesion> {
  const s = await sesionActual();
  if (!s) redirect("/entrar");
  return s;
}

/** Solo administración. Para quien no lo es, la página «no existe» (no se confirma que haya una sección). */
export async function requerirAdmin(): Promise<Sesion> {
  const s = await requerirSesion();
  if (s.rol !== "admin") notFound();
  return s;
}

/** Datos personales: solo la dueña, también para la administradora. Cualquier otro id es un 404. */
export async function requerirDuena(publicoDeLaUrl: string): Promise<Sesion> {
  const s = await requerirSesion();
  if (!esDuena(s, publicoDeLaUrl)) notFound();
  return s;
}

/** Adónde va cada una al entrar. */
export const inicioDe = (s: Sesion) => (s.rol === "admin" ? "/" : `/candidatos/${s.publico}`);
