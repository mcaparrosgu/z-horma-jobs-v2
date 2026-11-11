"use server";
// Enviar una candidatura aprobada a la empresa, y retirarla (bloque 4). El usuaria_id SIEMPRE sale de la sesión.
// Copia CONGELADA: se guarda el cv_md/carta_md de la candidatura EN ESTE MOMENTO; nunca nota, ATS, traza, huecos,
// perfil humano, preferencias ni otras candidaturas.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, conUsuaria, fijarUsuaria } from "@/lib/db";
import { requerirSesion } from "@/lib/sesion";
import { ID_OFERTA, SQL_MARCAR_ENVIADA, CANAL_PORTAL } from "@/lib/candidaturas";
import { SQL_CANDIDATURA_PARA_ENVIAR, SQL_ENVIAR_A_EMPRESA, SQL_RETIRAR_ENVIO, NOMBRE_CONTACTO_MAX, modoDeEnvio } from "@/lib/empresa-envio";
import { registrarEvento, errorSeguro } from "@/lib/importar";

export type EstadoEnvio = { ok: boolean; mensaje: string | null };

const t = (f: FormData, k: string, max = 300) => { const v = f.get(k); return typeof v === "string" ? v.slice(0, max) : ""; };

async function apunte(accion: "enviar-a-empresa" | "retirar-envio", ok: boolean, t0: number) {
  await registrarEvento(db(), { componente: "web-empresa", accion, resultado: ok ? "ok" : "error", duracion_ms: Date.now() - t0 }).catch(() => {});
}

export async function enviarAEmpresa(_previo: EstadoEnvio, f: FormData): Promise<EstadoEnvio> {
  const t0 = Date.now();
  const s = await requerirSesion();
  const ofertaId = t(f, "oferta_id", 80);
  if (!ID_OFERTA.test(ofertaId)) return { ok: false, mensaje: "Oferta no válida." };
  const compartir = f.get("compartir_contacto") === "on";
  const nombreContacto = compartir ? t(f, "nombre_contacto", NOMBRE_CONTACTO_MAX).trim() : "";
  if (compartir && !nombreContacto) return { ok: false, mensaje: "Escribe tu nombre, o desmarca la casilla de compartir contacto." };

  const fila = (await conUsuaria(s.usuaria_id, (c) => c.query(SQL_CANDIDATURA_PARA_ENVIAR, [s.usuaria_id, ofertaId]))).rows[0] as
    { cv_md: string; carta_md: string | null; estado: string; historial: { estado: string; canal?: string | null }[]; envio_vivo: boolean; empresa_id: string | null } | undefined;
  const modo = fila ? modoDeEnvio(fila) : null;
  if (!fila || !modo || !fila.empresa_id) {
    await apunte("enviar-a-empresa", false, t0);
    return { ok: false, mensaje: "Esta candidatura no se puede enviar así: solo las aprobadas (o las enviadas por el portal cuyo envío retiraste) de una oferta publicada por una empresa en Horma." };
  }

  const cliente = await db().connect();
  try {
    await cliente.query("BEGIN");
    await fijarUsuaria(cliente, s.usuaria_id); // RLS: dentro de esta transacción solo se ven y escriben filas de esta usuaria
    await cliente.query(SQL_ENVIAR_A_EMPRESA, [
      s.usuaria_id, ofertaId, fila.empresa_id, fila.cv_md, fila.carta_md,
      compartir ? nombreContacto : null, compartir ? s.email : null,
    ]);
    if (modo === "primero") { // en un reenvío la candidatura ya está «enviada»: solo se vuelve a dejar la copia en la bandeja
      const r = await cliente.query(SQL_MARCAR_ENVIADA, [s.usuaria_id, ofertaId, CANAL_PORTAL]);
      if ((r.rowCount ?? 0) !== 1) throw new Error("no se pudo anotar el envío en la candidatura");
    }
    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    await apunte("enviar-a-empresa", false, t0);
    return { ok: false, mensaje: `No se pudo enviar (${errorSeguro(e)}).` };
  } finally {
    cliente.release();
  }
  await apunte("enviar-a-empresa", true, t0);
  revalidatePath("/candidaturas/[id]", "page");
  revalidatePath("/seguimiento");
  redirect(`/candidaturas/${s.publico}`);
}

export async function retirarEnvio(formData: FormData): Promise<void> {
  const t0 = Date.now();
  const s = await requerirSesion();
  const ofertaId = t(formData, "oferta_id", 80);
  if (!ID_OFERTA.test(ofertaId)) return;
  const r = await conUsuaria(s.usuaria_id, (c) => c.query(SQL_RETIRAR_ENVIO, [s.usuaria_id, ofertaId])).catch(() => null);
  await apunte("retirar-envio", !!r && (r.rowCount ?? 0) === 1, t0);
  revalidatePath("/candidaturas/[id]", "page");
}
