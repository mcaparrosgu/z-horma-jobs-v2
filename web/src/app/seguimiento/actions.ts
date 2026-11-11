"use server";
// Registrar la respuesta de una empresa (bloque 2, seguimiento). El id de la usuaria sale de la SESIÓN; el estado
// actual que manda el formulario es solo para un mensaje más claro: la base vuelve a comprobar el estado real
// (SQL_REGISTRAR_RESPUESTA) y el disparador `candidaturas_transicion` (migración 017) es quien de verdad decide.
import { revalidatePath } from "next/cache";
import { db, conUsuaria } from "@/lib/db";
import { requerirSesion } from "@/lib/sesion";
import { SQL_REGISTRAR_RESPUESTA, ID_OFERTA, destinosDe, NOTA_MAX } from "@/lib/candidaturas";
import { registrarEvento } from "@/lib/importar";

export type EstadoAccion = { mensaje: string | null; ok: boolean };

const txt = (f: FormData, k: string, max = 300) => { const v = f.get(k); return typeof v === "string" ? v.slice(0, max) : ""; };

export async function registrarRespuesta(_previo: EstadoAccion, f: FormData): Promise<EstadoAccion> {
  const t0 = Date.now();
  const s = await requerirSesion();
  const oferta = txt(f, "oferta_id", 80);
  const destino = txt(f, "estado", 40);
  const actual = txt(f, "estado_actual", 40);
  const nota = txt(f, "nota", NOTA_MAX).trim();
  const apunte = (ok: boolean) =>
    registrarEvento(db(), { componente: "web-candidatos", accion: "registrar-respuesta", resultado: ok ? "ok" : "error", duracion_ms: Date.now() - t0 }).catch(() => {});

  if (!ID_OFERTA.test(oferta)) { await apunte(false); return { ok: false, mensaje: "Oferta no válida." }; }
  if (!destinosDe(actual).includes(destino)) { await apunte(false); return { ok: false, mensaje: "Ese cambio no está permitido desde donde está la candidatura ahora. Recarga la página." }; }

  const r = await conUsuaria(s.usuaria_id, (c) => c.query(SQL_REGISTRAR_RESPUESTA, [s.usuaria_id, oferta, destino, nota || null])).catch(() => null);
  const hecho = !!r && (r.rowCount ?? 0) === 1;
  await apunte(hecho);
  if (!hecho) return { ok: false, mensaje: "No se pudo registrar: puede que el estado haya cambiado mientras tanto. Recarga la página." };
  revalidatePath("/seguimiento");
  return { ok: true, mensaje: "Registrado." };
}
