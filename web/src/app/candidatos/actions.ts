"use server";
// Guardar las preferencias de una usuaria. Pasa por validarPreferencias (esquema preferencias.json) y el apunte
// de observabilidad solo lleva números. El id sale de la SESIÓN, nunca del formulario: nadie puede editar las de otra.
import { revalidatePath } from "next/cache";
import { db, conUsuaria } from "@/lib/db";
import { validarPreferencias } from "@/lib/preferencias";
import { requerirSesion } from "@/lib/sesion";
import { validarRespuesta, comoRespuesta, SQL_AGREGAR_RESPUESTA, SQL_BORRAR_RESPUESTA, paramsAgregar, paramsBorrar } from "@/lib/respuestas";
import { registrarEvento, errorSeguro, sqlPreferencias, paramsPreferencias } from "@/lib/importar";

export type EstadoPrefs = { ok: boolean; errores: string[]; enviado?: Record<string, string | string[]> };

const t = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v.slice(0, 2000) : ""; };

export async function guardarPreferencias(_previo: EstadoPrefs, f: FormData): Promise<EstadoPrefs> {
  const id = (await requerirSesion()).usuaria_id; // el campo «usuaria_id» del formulario se ignora
  const enviado: Record<string, string | string[]> = {
    puestos: t(f, "puestos"), ciudades: t(f, "ciudades"), paises: t(f, "paises"), contrato: t(f, "contrato"),
    idiomas: t(f, "idiomas"), sectores: t(f, "sectores"), niveles: t(f, "niveles"), sueldo_min: t(f, "sueldo_min"),
    rango_min: t(f, "rango_min"), rango_max: t(f, "rango_max"),
    remoto: f.getAll("remoto").filter((v): v is string => typeof v === "string"),
    horario: f.getAll("horario").filter((v): v is string => typeof v === "string"),
  };
  const r = validarPreferencias(enviado as Parameters<typeof validarPreferencias>[0]);
  if (!r.ok) return { ok: false, errores: r.errores, enviado };

  const t0 = Date.now();
  const apunte = (resultado: "ok" | "error") =>
    registrarEvento(db(), { componente: "web-candidatos", accion: "guardar-preferencias", resultado, duracion_ms: Date.now() - t0 }).catch(() => {});
  try {
    // Solo se actualiza a una usuaria que ya existe: el UPSERT falla por clave foránea si no existe.
    await conUsuaria(id, (c) => c.query(sqlPreferencias(true), paramsPreferencias(id, r.prefs)));
  } catch (e) {
    await apunte("error");
    return { ok: false, errores: [`No se pudo guardar (${errorSeguro(e)})`], enviado };
  }
  await apunte("ok");
  revalidatePath("/candidatos/[id]", "page");
  return { ok: true, errores: [] };
}

// --- Entrevista única: respuestas del perfil (ver, añadir, borrar). El id sale de la SESIÓN; el SQL está en lib/respuestas.ts.

export type EstadoRespuesta = { ok: boolean; error: string | null; enviado?: { tema: string; texto: string } };

export async function agregarRespuesta(_previo: EstadoRespuesta, f: FormData): Promise<EstadoRespuesta> {
  const id = (await requerirSesion()).usuaria_id;
  const tema = t(f, "tema"), texto = t(f, "texto");
  const r = validarRespuesta(tema, texto);
  if (!r.ok) return { ok: false, error: r.error, enviado: { tema, texto } };
  try {
    const res = await conUsuaria(id, (c) => c.query(SQL_AGREGAR_RESPUESTA, paramsAgregar(id, r.respuesta)));
    if (res.rowCount === 0) return { ok: false, error: "Todavía no tienes perfil: sube tu CV primero.", enviado: { tema, texto } };
  } catch (e) {
    // El tope de 60 respuestas lo impone la base (CHECK); el resto del detalle técnico no se enseña.
    const lleno = (e as { code?: string }).code === "23514";
    return { ok: false, error: lleno ? "Has llegado al máximo de respuestas guardadas (por número o por tamaño). Borra alguna para añadir otra." : `No se pudo guardar (${errorSeguro(e)})`, enviado: { tema, texto } };
  }
  revalidatePath("/candidatos/[id]", "page");
  revalidatePath("/candidaturas/[id]", "page"); // las preguntas de una candidatura se ocultan al contestarlas
  return { ok: true, error: null };
}

export async function borrarRespuesta(f: FormData): Promise<void> {
  const id = (await requerirSesion()).usuaria_id;
  const r = comoRespuesta({ tema: f.get("tema"), texto: f.get("texto"), fecha: f.get("fecha") });
  if (!r) return;
  try {
    await conUsuaria(id, (c) => c.query(SQL_BORRAR_RESPUESTA, paramsBorrar(id, r)));
  } catch (e) {
    throw new Error(`No se pudo borrar (${errorSeguro(e)})`); // sin el detalle de la base, que puede traer el texto de las respuestas
  }
  revalidatePath("/candidatos/[id]", "page");
}
