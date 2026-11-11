"use server";
// Entrar, registrarse y salir. Los errores al usuario son genéricos (no dicen qué correos existen) y los apuntes de
// observabilidad solo llevan el resultado y la duración: nunca el correo ni la contraseña.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { entrarConContrasena, registrarCuenta, type Entrada } from "@/lib/acceso";
import { cerrarSesion, crearSesion } from "@/lib/sesion";
import { registrarEvento } from "@/lib/importar";
import { ipDelCliente, ipBloqueada, anotarFalloIp, MAX_REGISTROS_IP } from "@/lib/limite-ip";
import { ERROR_ENTRAR } from "@/lib/acceso";

export type EstadoAcceso = { error: string | null; email?: string }; // se devuelve el correo (nunca la contraseña) para no vaciar el formulario

const txt = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.slice(0, 300) : ""; };

async function apunte(accion: "entrar" | "registrar", ok: boolean, t0: number) {
  await registrarEvento(db(), { componente: "web-acceso", accion, resultado: ok ? "ok" : "error", duracion_ms: Date.now() - t0 }).catch(() => {});
}

async function abrir(r: Entrada, accion: "entrar" | "registrar", t0: number, email: string): Promise<EstadoAcceso> {
  await apunte(accion, r.ok, t0);
  if (!r.ok) return { error: r.error, email };
  await crearSesion(r.usuaria_id);
  redirect("/"); // la portada manda a cada una a su sitio (administración o su perfil)
}

export async function entrar(_previo: EstadoAcceso, f: FormData): Promise<EstadoAcceso> {
  const t0 = Date.now();
  // Límite de fallos por IP (B4-7): solo actúa con proxy de confianza declarado (ver limite-ip.ts). Si falla la base, no se bloquea a nadie.
  const ip = ipDelCliente((await headers()).get("x-forwarded-for"));
  if (await ipBloqueada(db(), "usuaria", ip).catch(() => false)) return abrir({ ok: false, error: ERROR_ENTRAR }, "entrar", t0, txt(f, "email"));
  const r = await entrarConContrasena(db(), txt(f, "email"), txt(f, "contrasena"));
  if (!r.ok) await anotarFalloIp(db(), "usuaria", ip).catch(() => {});
  return abrir(r, "entrar", t0, txt(f, "email"));
}

export async function registrar(_previo: EstadoAcceso, f: FormData): Promise<EstadoAcceso> {
  const t0 = Date.now();
  if (txt(f, "contrasena") !== txt(f, "repetir")) return { error: "Las dos contraseñas no coinciden.", email: txt(f, "email") };
  // Límite de altas por IP: cada intento cuenta (salga bien o mal), en su propio ámbito, para frenar la creación masiva de cuentas.
  const ip = ipDelCliente((await headers()).get("x-forwarded-for"));
  if (await ipBloqueada(db(), "registro", ip, MAX_REGISTROS_IP).catch(() => false)) return abrir({ ok: false, error: "Demasiados intentos desde este sitio: espera unos minutos." }, "registrar", t0, txt(f, "email"));
  await anotarFalloIp(db(), "registro", ip).catch(() => {}); // aquí «fallo» significa «intento de alta»: el contador es el mismo
  const cliente = await db().connect(); // una transacción necesita una sola conexión
  try {
    return await abrir(await registrarCuenta(cliente, txt(f, "email"), txt(f, "contrasena")), "registrar", t0, txt(f, "email"));
  } finally {
    cliente.release();
  }
}

export async function salir(): Promise<void> {
  await cerrarSesion();
  redirect("/entrar");
}
