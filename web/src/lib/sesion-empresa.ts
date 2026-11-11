// Sesión de empresa en el servidor (bloque 3): su propia cookie, aparte de la de usuaria (`sesion.ts`).
// Una sesión de empresa nunca vale para páginas de candidata ni al revés: no comparten cookie ni tabla.
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { huella, nuevoToken, SESION_DIAS } from "./auth";
import { url_base } from "./sesion";

const seguro = () => process.env.NODE_ENV === "production" || url_base().startsWith("https://");
export const COOKIE_EMPRESA = "horma_sesion_empresa";

export type SesionEmpresa = { empresa_id: string; nombre: string; email: string };

const SQL_SESION_EMPRESA = `
  SELECT s.empresa_id, e.nombre, c.email
  FROM sesiones_empresa s JOIN cuentas_empresa c ON c.empresa_id = s.empresa_id JOIN empresas e ON e.id = s.empresa_id
  WHERE s.huella = $1 AND s.caduca_en > now()`;

export async function crearSesionEmpresa(empresaId: string): Promise<void> {
  const token = nuevoToken();
  await db().query("DELETE FROM sesiones_empresa WHERE caduca_en < now()");
  await db().query(
    "INSERT INTO sesiones_empresa (huella, empresa_id, caduca_en) VALUES ($1, $2, now() + make_interval(days => $3))",
    [huella(token), empresaId, SESION_DIAS],
  );
  (await cookies()).set(COOKIE_EMPRESA, token, {
    httpOnly: true, sameSite: "lax", secure: seguro(), path: "/", maxAge: SESION_DIAS * 24 * 3600,
  });
}

export const sesionEmpresaActual = cache(async (): Promise<SesionEmpresa | null> => {
  const token = (await cookies()).get(COOKIE_EMPRESA)?.value;
  if (!token || token.length > 200) return null;
  const r = await db().query<SesionEmpresa>(SQL_SESION_EMPRESA, [huella(token)]);
  return r.rows[0] ?? null;
});

export async function cerrarSesionEmpresa(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_EMPRESA)?.value;
  if (token && token.length <= 200) await db().query("DELETE FROM sesiones_empresa WHERE huella = $1", [huella(token)]);
  jar.delete(COOKIE_EMPRESA);
}

export async function requerirSesionEmpresa(): Promise<SesionEmpresa> {
  const s = await sesionEmpresaActual();
  if (!s) redirect("/empresa/entrar");
  return s;
}

/** Una oferta solo la ve o edita su propia empresa: cualquier otro id de empresa, 404 (igual que requerirDuena). */
export function comprobarOfertaPropia(sesion: SesionEmpresa, empresaIdDeLaOferta: string | null): void {
  if (empresaIdDeLaOferta !== sesion.empresa_id) notFound();
}
