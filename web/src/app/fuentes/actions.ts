"use server";
// Guardar una fuente. Toda escritura pasa por validarFuente (hallazgos a y d); el apunte de observabilidad
// va por registrarEvento, que solo admite números.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { validarFuente, SQL_GUARDAR_FUENTE, paramsFuente } from "@/lib/fuentes";
import { registrarEvento, errorSeguro } from "@/lib/importar";
import { requerirAdmin } from "@/lib/sesion";

export type EstadoFormulario = { ok: boolean; errores: string[]; guardada?: string; enviado?: Record<string, string> };

// React vacía el formulario tras cada envío: devolvemos lo escrito para que no se pierda si hay errores.
const CAMPOS = ["nombre", "url", "parametros", "cabeceras", "clave_env", "clave_en", "clave_nombre", "mapeo_campos"];
// Si el rechazo fue por «parece credencial», esos campos NO se devuelven al navegador.
function eco(f: FormData, sinSecretos = false): Record<string, string> {
  const o: Record<string, string> = {};
  for (const c of CAMPOS) { const v = f.get(c); if (typeof v === "string") o[c] = v.slice(0, 20_000); }
  o.activa = f.get("activa") === "on" ? "on" : "";
  if (sinSecretos) for (const c of ["url", "parametros", "cabeceras", "mapeo_campos"]) o[c] = "";
  return o;
}

// Un error de JSON.parse puede repetir el texto pegado (por si era una clave): se descarta el mensaje.
function leerJson(texto: FormDataEntryValue | null, campo: string, errores: string[]): unknown {
  if (typeof texto !== "string" || texto.length > 20_000) { errores.push(`${campo}: texto ausente o demasiado largo`); return undefined; }
  try { return JSON.parse(texto.trim() || "{}"); } catch { errores.push(`${campo}: no es un JSON válido`); return undefined; }
}

const texto = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

export async function guardarFuente(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  await requerirAdmin(); // una acción es un punto de entrada público: se comprueba aquí, no solo en la página
  const errores: string[] = [];
  const parametros = leerJson(f.get("parametros"), "parámetros", errores);
  const cabeceras = leerJson(f.get("cabeceras"), "cabeceras", errores);
  const mapeo = leerJson(f.get("mapeo_campos"), "mapeo_campos", errores);
  if (errores.length) return { ok: false, errores, enviado: eco(f) };

  const r = validarFuente({
    nombre: texto(f, "nombre"), url: texto(f, "url"), parametros, cabeceras,
    clave_env: texto(f, "clave_env"), clave_en: texto(f, "clave_en"), clave_nombre: texto(f, "clave_nombre"),
    mapeo_campos: mapeo, activa: f.get("activa") === "on",
  });
  if (!r.ok) return { ok: false, errores: r.errores, enviado: eco(f, r.errores.some((e) => e.includes("credencial"))) };

  const t0 = Date.now();
  const apunte = (resultado: "ok" | "error") =>
    registrarEvento(db(), { componente: "web-ingesta", accion: "guardar-fuente", resultado, duracion_ms: Date.now() - t0 }).catch(() => {});
  try {
    await db().query(SQL_GUARDAR_FUENTE, paramsFuente(r.fuente));
  } catch (e) {
    await apunte("error");
    return { ok: false, errores: [`No se pudo guardar (${errorSeguro(e)})`], enviado: eco(f) }; // sin el mensaje de Postgres (hallazgo B)
  }
  await apunte("ok"); // si falla el apunte, la fuente ya está guardada: no se informa de error
  revalidatePath("/fuentes");
  return { ok: true, errores: [], guardada: r.fuente.nombre };
}
