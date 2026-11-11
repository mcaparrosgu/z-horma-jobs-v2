"use server";
// Mi cuenta (bloque 1, construcción autónoma, RGPD): cambiar contraseña y borrar la cuenta propia.
// El id SIEMPRE sale de la sesión (requerirSesion), nunca del formulario: nadie puede tocar la cuenta de otra.
import { join } from "node:path";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cambiarContrasenaPropia, puedeBorrarCuenta } from "@/lib/cuenta";
import { requerirSesion, cerrarSesion, crearSesion } from "@/lib/sesion";
import { aCuarentena, purgarCuarentena, restaurar, SQL_BORRAR_CUENTA_PROPIA } from "@/lib/datos-usuaria";
import { registrarEvento } from "@/lib/importar";

export type EstadoCuenta = { ok: boolean; error: string | null };

const t = (f: FormData, k: string, max = 254) => { const v = f.get(k); return typeof v === "string" ? v.slice(0, max) : ""; };
const apunte = (accion: "cambiar-contrasena" | "borrar-cuenta", resultado: "ok" | "error", t0: number) =>
  registrarEvento(db(), { componente: "web-cuenta", accion, resultado, duracion_ms: Date.now() - t0 }).catch(() => {});

export async function cambiarContrasena(_previo: EstadoCuenta, f: FormData): Promise<EstadoCuenta> {
  const s = await requerirSesion();
  const t0 = Date.now();
  const nueva = t(f, "nueva", 128);
  if (nueva !== t(f, "repetir", 128)) { await apunte("cambiar-contrasena", "error", t0); return { ok: false, error: "Las dos contraseñas nuevas no coinciden." }; }
  const r = await cambiarContrasenaPropia(db(), s.usuaria_id, t(f, "actual", 128), nueva);
  await apunte("cambiar-contrasena", r.ok ? "ok" : "error", t0);
  if (!r.ok) return { ok: false, error: r.error };
  // Cierra TODAS las sesiones (también la de este navegador) y abre una nueva: así quien tenía la contraseña vieja
  // en otro sitio se queda fuera, y tú sigues dentro aquí.
  await db().query("DELETE FROM sesiones WHERE usuaria_id = $1", [s.usuaria_id]);
  await crearSesion(s.usuaria_id);
  return { ok: true, error: null };
}

export async function borrarCuenta(_previo: EstadoCuenta, f: FormData): Promise<EstadoCuenta> {
  const s = await requerirSesion();
  const t0 = Date.now();
  if (s.rol === "admin") { await apunte("borrar-cuenta", "error", t0); return { ok: false, error: "La cuenta de administración no se borra desde la web." }; }
  const r = await puedeBorrarCuenta(db(), s.usuaria_id, t(f, "confirmacion"));
  if (!r.ok) { await apunte("borrar-cuenta", "error", t0); return { ok: false, error: r.error }; }

  const DATOS = join(process.cwd(), "..", "datos");
  let enCuarentena = false;
  try {
    aCuarentena(DATOS, s.usuaria_id); // mover a cuarentena es casi instantáneo y, si algo falla después, se deshace
    enCuarentena = true;
    const res = await db().query(SQL_BORRAR_CUENTA_PROPIA, [s.usuaria_id]);
    const filas = Number((res.rows[0] as { filas?: number } | undefined)?.filas ?? 0);
    if (filas === 0) throw new Error("la base no borró ninguna fila");
  } catch {
    if (enCuarentena) restaurar(DATOS, s.usuaria_id);
    await apunte("borrar-cuenta", "error", t0);
    return { ok: false, error: "No se pudo borrar tu cuenta. Inténtalo otra vez." };
  }
  // La base ya borró: aquí NO se restaura (dejaría archivos de una cuenta que ya no existe). Si la purga falla,
  // la carpeta .borrando-<id> queda y se avisa en el registro para borrarla a mano (`npm run borrar`).
  try { purgarCuarentena(DATOS, s.usuaria_id); } catch { await apunte("borrar-cuenta", "error", t0); }
  await apunte("borrar-cuenta", "ok", t0);
  await cerrarSesion();
  redirect("/entrar?borrada=1");
}
