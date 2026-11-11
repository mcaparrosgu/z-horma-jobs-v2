"use server";
// Publicar, editar y cerrar una oferta (bloque 3). El empresa_id SIEMPRE sale de la sesión de empresa, nunca del
// formulario: nadie puede publicar, editar ni cerrar en nombre de otra empresa.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requerirSesionEmpresa } from "@/lib/sesion-empresa";
import {
  validarOfertaEmpresa, nuevoIdOferta, SQL_PUBLICAR_OFERTA, paramsPublicarOferta, SQL_EDITAR_OFERTA,
  SQL_CERRAR_OFERTA, TIPOS_AVISO, type DatosOfertaEmpresa,
} from "@/lib/empresa-oferta";
import { registrarEvento, errorSeguro } from "@/lib/importar";

export type EstadoOferta = { ok: boolean; errores: string[] };

const t = (f: FormData, k: string, max = 300) => { const v = f.get(k); return typeof v === "string" ? v.slice(0, max) : ""; };

function leerDatos(f: FormData): DatosOfertaEmpresa {
  const avisos = (TIPOS_AVISO.filter((x) => x !== "otro") as readonly string[])
    .filter((tipo) => f.get(`aviso_${tipo}`) === "on")
    .map((tipo) => ({ tipo, texto: t(f, `aviso_${tipo}_texto`, 300) }));
  const otroTexto = t(f, "aviso_otro_texto", 300);
  if (otroTexto) avisos.push({ tipo: "otro", texto: otroTexto });
  return {
    titulo: t(f, "titulo", 200), descripcion: t(f, "descripcion", 8000), ubicacion: t(f, "ubicacion", 120),
    remoto: t(f, "remoto", 20), contrato: t(f, "contrato", 20), idioma: t(f, "idioma", 20), nivel: t(f, "nivel", 20),
    sectorFamilia: t(f, "sectorFamilia", 120), requisitos: t(f, "requisitos", 4000),
    salarioPublicado: f.get("salarioPublicado") === "on", salarioMin: t(f, "salarioMin", 20), salarioMax: t(f, "salarioMax", 20),
    salarioPeriodo: t(f, "salarioPeriodo", 20), avisos,
  };
}

const apunte = (accion: "publicar-oferta" | "editar-oferta" | "cerrar-oferta", ok: boolean, t0: number) =>
  registrarEvento(db(), { componente: "web-empresa", accion, resultado: ok ? "ok" : "error", duracion_ms: Date.now() - t0 }).catch(() => {});

export async function publicarOferta(_previo: EstadoOferta, f: FormData): Promise<EstadoOferta> {
  const t0 = Date.now();
  const s = await requerirSesionEmpresa();
  const r = validarOfertaEmpresa(leerDatos(f), { id: s.empresa_id, nombre: s.nombre }, nuevoIdOferta());
  if (!r.ok) { await apunte("publicar-oferta", false, t0); return { ok: false, errores: r.errores }; }
  try {
    await db().query(SQL_PUBLICAR_OFERTA, paramsPublicarOferta(r.oferta, s.empresa_id));
  } catch (e) {
    await apunte("publicar-oferta", false, t0);
    if ((e as { code?: string }).code === "HJ001") return { ok: false, errores: ["Has llegado al tope de 50 ofertas activas (pendientes y aprobadas): cierra alguna antes de publicar otra."] };
    return { ok: false, errores: [`No se pudo publicar (${errorSeguro(e)})`] };
  }
  await apunte("publicar-oferta", true, t0);
  revalidatePath("/empresa");
  redirect("/empresa");
}

export async function editarOferta(_previo: EstadoOferta, f: FormData): Promise<EstadoOferta> {
  const t0 = Date.now();
  const s = await requerirSesionEmpresa();
  const ofertaId = t(f, "oferta_id", 80);
  const r = validarOfertaEmpresa(leerDatos(f), { id: s.empresa_id, nombre: s.nombre }, ofertaId);
  if (!r.ok) { await apunte("editar-oferta", false, t0); return { ok: false, errores: r.errores }; }
  const o = r.oferta;
  const res = await db().query(SQL_EDITAR_OFERTA, [
    ofertaId, s.empresa_id, o.titulo, o.descripcion ?? null, o.ubicacion, o.remoto, o.contrato, o.idioma, o.nivel,
    JSON.stringify(o.requisitos), JSON.stringify(o.salario), JSON.stringify(o.avisos ?? []),
    JSON.stringify((o.auditoria as { instrucciones_embebidas: string[] }).instrucciones_embebidas),
  ]).catch(() => null);
  const hecho = !!res && (res.rowCount ?? 0) === 1;
  await apunte("editar-oferta", hecho, t0);
  if (!hecho) return { ok: false, errores: ["No se pudo actualizar: comprueba que sigue siendo tuya y que no está cerrada."] };
  revalidatePath("/empresa");
  redirect("/empresa");
}

export async function cerrarOferta(formData: FormData): Promise<void> {
  const s = await requerirSesionEmpresa();
  const ofertaId = t(formData, "oferta_id", 80);
  const t0 = Date.now();
  const res = await db().query(SQL_CERRAR_OFERTA, [ofertaId, s.empresa_id]).catch(() => null);
  await apunte("cerrar-oferta", !!res && (res.rowCount ?? 0) === 1, t0);
  revalidatePath("/empresa");
}
