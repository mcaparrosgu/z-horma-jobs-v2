"use server";
// Moderación de ofertas de empresa (bloque 3): solo administración. Toda oferta de empresa nace
// pendiente_de_revision y no aparece en /ofertas hasta pasar por aquí (también lo hace cumplir el disparador
// `ofertas_moderacion`, migración 018: esto no es la única defensa).
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/sesion";
import { SQL_MODERAR_OFERTA, SQL_RETIRAR_OFERTA_ADMIN, moderacionValida, motivoRechazoValido } from "@/lib/empresa-oferta";
import { registrarEvento } from "@/lib/importar";

export async function moderarOferta(formData: FormData): Promise<void> {
  await requerirAdmin();
  const id = typeof formData.get("oferta_id") === "string" ? (formData.get("oferta_id") as string).slice(0, 80) : "";
  const destino = formData.get("estado");
  const t0 = Date.now();
  if (!moderacionValida(destino)) return;
  const version = typeof formData.get("version") === "string" ? (formData.get("version") as string).slice(0, 64) : "";
  const motivo = motivoRechazoValido(formData.get("motivo"));
  if (destino === "rechazada" && !motivo) return; // sin motivo no se rechaza: la empresa tiene que saber qué corregir
  const res = await db().query(SQL_MODERAR_OFERTA, [id, destino, version, destino === "rechazada" ? motivo : null]).catch(() => null);
  await registrarEvento(db(), {
    componente: "web-empresa", accion: "moderar-oferta", resultado: !!res && (res.rowCount ?? 0) === 1 ? "ok" : "error",
    duracion_ms: Date.now() - t0,
  }).catch(() => {});
  revalidatePath("/admin/ofertas-empresas");
  revalidatePath("/ofertas");
}

/** Retira (cierra) una oferta de empresa ya aprobada. Solo administración. */
export async function retirarOferta(formData: FormData): Promise<void> {
  await requerirAdmin();
  const id = typeof formData.get("oferta_id") === "string" ? (formData.get("oferta_id") as string).slice(0, 80) : "";
  const t0 = Date.now();
  const res = await db().query(SQL_RETIRAR_OFERTA_ADMIN, [id]).catch(() => null);
  await registrarEvento(db(), {
    componente: "web-empresa", accion: "moderar-oferta", resultado: !!res && (res.rowCount ?? 0) === 1 ? "ok" : "error",
    duracion_ms: Date.now() - t0,
  }).catch(() => {});
  revalidatePath("/admin/ofertas-empresas");
  revalidatePath("/ofertas");
}
