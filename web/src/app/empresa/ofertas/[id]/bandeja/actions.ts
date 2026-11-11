"use server";
// Cambiar el estado de la bandeja (bloque 4). El empresa_id SIEMPRE sale de la sesión de empresa.
import { revalidatePath } from "next/cache";
import { db, conEmpresa } from "@/lib/db";
import { requerirSesionEmpresa } from "@/lib/sesion-empresa";
import { SQL_CAMBIAR_ESTADO_BANDEJA, estadoBandejaValido } from "@/lib/empresa-envio";
import { registrarEvento } from "@/lib/importar";

export async function cambiarEstadoBandeja(formData: FormData): Promise<void> {
  const s = await requerirSesionEmpresa();
  const idEnvio = Number(formData.get("envio_id"));
  const ofertaId = typeof formData.get("oferta_id") === "string" ? (formData.get("oferta_id") as string).slice(0, 80) : "";
  const estado = formData.get("estado");
  const t0 = Date.now();
  if (!Number.isInteger(idEnvio) || !estadoBandejaValido(estado)) return;
  const res = await conEmpresa(s.empresa_id, (c) => c.query(SQL_CAMBIAR_ESTADO_BANDEJA, [idEnvio, s.empresa_id, estado])).catch(() => null);
  await registrarEvento(db(), {
    componente: "web-empresa", accion: "cambiar-estado-bandeja", resultado: !!res && (res.rowCount ?? 0) === 1 ? "ok" : "error",
    duracion_ms: Date.now() - t0,
  }).catch(() => {});
  revalidatePath(`/empresa/ofertas/${ofertaId}/bandeja`);
}
