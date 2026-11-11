// Publicar y moderar ofertas de empresa (bloque 3): validación contra el esquema (lee disco) y consultas SQL.
// SOLO SERVIDOR: nunca lo importa un componente de cliente (por eso las listas cerradas y los tipos puros viven
// aparte, en empresa-oferta-datos.ts, que ese sí puede ir al navegador).
import { randomBytes } from "node:crypto";
import { validar } from "./esquemas.ts";
import type { Resultado as ResultadoEsquema } from "./esquemas.ts";
import { url_base } from "./url-base.ts";
import { detectarInstrucciones } from "./instrucciones-embebidas.ts";
import {
  REMOTOS_EMPRESA, CONTRATOS, IDIOMAS_TRABAJO, NIVELES_EMPRESA, SECTORES_FAMILIAS, TIPOS_AVISO, PERIODOS_SALARIO,
  listaDeLineas, type DatosOfertaEmpresa,
} from "./empresa-oferta-datos.ts";

export * from "./empresa-oferta-datos.ts";

export const nuevoIdOferta = () => `oe${randomBytes(8).toString("hex")}`;
const hoyISO = () => new Date().toISOString().slice(0, 10);

export type ResultadoOferta = { ok: true; oferta: Record<string, unknown> } | { ok: false; errores: string[] };

/** Construye el oferta.json de una empresa y lo valida con el esquema `oferta` (el mismo que usan los agentes). */
export function validarOfertaEmpresa(d: DatosOfertaEmpresa, empresa: { id: string; nombre: string }, id: string): ResultadoOferta {
  const errores: string[] = [];
  const titulo = d.titulo.trim().slice(0, 200);
  const ubicacion = d.ubicacion.trim().slice(0, 120);
  if (!titulo) errores.push("Escribe el título del puesto.");
  if (!ubicacion) errores.push("Escribe la ciudad.");
  if (!(REMOTOS_EMPRESA as readonly string[]).includes(d.remoto)) errores.push("Elige la modalidad.");
  if (!(CONTRATOS as readonly string[]).includes(d.contrato)) errores.push("Elige el tipo de contrato.");
  if (!(IDIOMAS_TRABAJO as readonly string[]).includes(d.idioma)) errores.push("Elige el idioma de trabajo.");
  if (!(NIVELES_EMPRESA as readonly string[]).includes(d.nivel)) errores.push("Elige el nivel.");
  const [sector, familia] = (d.sectorFamilia ?? "").split("::");
  if (!sector || !familia || !(SECTORES_FAMILIAS[sector] ?? []).includes(familia)) errores.push("Elige sector y familia de la lista.");
  const avisos = d.avisos.filter((a) => (TIPOS_AVISO as readonly string[]).includes(a.tipo) && a.texto.trim().length > 0)
    .map((a) => ({ tipo: a.tipo, texto: a.texto.trim().slice(0, 300) }));

  let salario: { publicado: boolean; min: number | null; max: number | null; moneda: string | null; periodo?: string | null } = {
    publicado: false, min: null, max: null, moneda: null,
  };
  if (d.salarioPublicado) {
    const min = Number(d.salarioMin), max = Number(d.salarioMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) errores.push("El sueldo mínimo y máximo tienen que ser números válidos (mínimo ≤ máximo).");
    if (!(PERIODOS_SALARIO as readonly string[]).includes(d.salarioPeriodo)) errores.push("Elige el periodo del sueldo.");
    salario = { publicado: true, min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null, moneda: "EUR", periodo: d.salarioPeriodo as never };
  }

  if (errores.length > 0) return { ok: false, errores };

  // Ninguna clave se deja con valor `undefined`: una clave presente con valor undefined no es lo mismo que
  // ausente para el validador del esquema (fallaría el tipo en vez de verla como campo opcional omitido).
  const descripcion = d.descripcion.trim().slice(0, 8000);
  // La url tiene que ser http(s) (restricción `ofertas_url_http`, migración 002): no hay página original externa,
  // así que apunta al listado de Horma (no hay ficha propia por id todavía).
  const oferta: Record<string, unknown> = {
    id, fuente: `empresa:${empresa.id}`, url: `${url_base()}/ofertas`,
    fecha: hoyISO(), titulo,
    empresa: empresa.nombre, ubicacion, pais: "ES", remoto: d.remoto, contrato: d.contrato, idioma: d.idioma,
    nivel: d.nivel, requisitos: listaDeLineas(d.requisitos),
    origen: { licencia: "empresa", atribucion: empresa.nombre },
    salario,
    taxonomia: { sector, familia, stack: [] },
    auditoria: {
      fantasma: { sospechosa: false, motivos: [] }, fraude: { sospechosa: false, motivos: [] },
      empresa_validada: { valor: "no_comprobada" }, instrucciones_embebidas: detectarInstrucciones([titulo, ubicacion, empresa.nombre, descripcion, ...listaDeLineas(d.requisitos), ...avisos.map((a) => a.texto)]),
    },
  };
  if (descripcion) oferta.descripcion = descripcion;
  if (avisos.length > 0) oferta.avisos = avisos;
  const r: ResultadoEsquema = validar("oferta", oferta);
  if (!r.ok) return { ok: false, errores: r.errores };
  return { ok: true, oferta };
}

// --- Consultas (empresa_id siempre de la SESIÓN, nunca del formulario) ------------------------------------
export const SQL_OFERTAS_EMPRESA = `
  SELECT id, titulo, ubicacion, estado_publicacion, creada_en, motivo_rechazo FROM ofertas WHERE empresa_id = $1 ORDER BY creada_en DESC`;

export const SQL_OFERTA_PROPIA = `
  SELECT id, titulo, descripcion, ubicacion, remoto, contrato, idioma, nivel, sector, familia, requisitos,
         salario, avisos, estado_publicacion, empresa_id
  FROM ofertas WHERE id = $1`;

export const SQL_PUBLICAR_OFERTA = `
  INSERT INTO ofertas (id, fuente, url, fecha, titulo, descripcion, empresa, ubicacion, pais, remoto, contrato,
                        idioma, nivel, requisitos, salario, stack, avisos, auditoria, licencia, atribucion,
                        estado_publicacion, empresa_id, sector, familia)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,'[]'::jsonb,$16::jsonb,$17::jsonb,'empresa',$7,
          'pendiente_de_revision',$18,$19,$20)`;

export function paramsPublicarOferta(o: Record<string, unknown>, empresaId: string): unknown[] {
  return [
    o.id, o.fuente, o.url, o.fecha, o.titulo, o.descripcion ?? null, o.empresa, o.ubicacion, o.pais, o.remoto,
    o.contrato, o.idioma, o.nivel, JSON.stringify(o.requisitos), JSON.stringify(o.salario),
    JSON.stringify(o.avisos ?? []), JSON.stringify(o.auditoria), empresaId,
    (o.taxonomia as { sector?: string } | undefined)?.sector ?? null, (o.taxonomia as { familia?: string } | undefined)?.familia ?? null,
  ];
}

// Tras editar, si ya estaba aprobada o rechazada vuelve a pendiente_de_revision (el disparador 018 lo permite);
// una oferta cerrada no se edita (WHERE la excluye). sector/familia no se tocan aquí (van en taxonomia, de solo lectura para la empresa tras publicar: se fijaron al crearla).
export const SQL_EDITAR_OFERTA = `
  UPDATE ofertas SET
    titulo = $3, descripcion = $4, ubicacion = $5, remoto = $6, contrato = $7, idioma = $8, nivel = $9,
    requisitos = $10::jsonb, salario = $11::jsonb, avisos = $12::jsonb,
    auditoria = jsonb_set(auditoria, '{instrucciones_embebidas}', $13::jsonb),
    estado_publicacion = CASE WHEN estado_publicacion IN ('aprobada', 'rechazada') THEN 'pendiente_de_revision' ELSE estado_publicacion END,
    motivo_rechazo = CASE WHEN estado_publicacion IN ('aprobada', 'rechazada') THEN NULL ELSE motivo_rechazo END
  WHERE id = $1 AND empresa_id = $2 AND estado_publicacion <> 'cerrada'`;

export const SQL_CERRAR_OFERTA = `
  UPDATE ofertas SET estado_publicacion = 'cerrada' WHERE id = $1 AND empresa_id = $2 AND estado_publicacion = 'aprobada'`;

// --- Moderación (solo administración) ----------------------------------------------------------------------
// «Versión» del texto que ve la administración: si la empresa edita la oferta entre que se muestra y se pulsa
// Aprobar, la versión cambia y la aprobación no se aplica (nadie aprueba un texto que no ha visto).
const VERSION_OFERTA = `md5(concat_ws('|', titulo, descripcion, ubicacion, remoto, contrato, nivel, requisitos::text, avisos::text))`;

export const SQL_OFERTAS_PENDIENTES = `
  SELECT ${VERSION_OFERTA} AS version, o.auditoria->'instrucciones_embebidas' AS instrucciones, o.id, o.titulo, o.descripcion, o.ubicacion, o.remoto, o.contrato, o.nivel, o.requisitos, o.avisos,
         o.creada_en, e.nombre AS empresa_nombre
  FROM ofertas o JOIN empresas e ON e.id = o.empresa_id
  WHERE o.estado_publicacion = 'pendiente_de_revision'
  ORDER BY o.creada_en`;

export const SQL_MODERAR_OFERTA = `
  UPDATE ofertas SET estado_publicacion = $2, motivo_rechazo = CASE WHEN $2 = 'rechazada' THEN $4::text ELSE NULL END
  WHERE id = $1 AND empresa_id IS NOT NULL AND estado_publicacion = 'pendiente_de_revision' AND ${VERSION_OFERTA} = $3`;
/** Motivo de rechazo: obligatorio al rechazar (la empresa lo lee para corregir), 1 a 500 caracteres; null si no vale. */
export const motivoRechazoValido = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return t.length >= 1 && t.length <= 500 ? t : null;
};

// Ofertas de empresa ya aprobadas, para que la administración pueda retirar una estafa que se coló.
export const SQL_OFERTAS_APROBADAS_EMPRESA = `
  SELECT o.id, o.titulo, e.nombre AS empresa_nombre
  FROM ofertas o JOIN empresas e ON e.id = o.empresa_id
  WHERE o.estado_publicacion = 'aprobada'
  ORDER BY o.creada_en DESC LIMIT 200`;
export const SQL_RETIRAR_OFERTA_ADMIN = `
  UPDATE ofertas SET estado_publicacion = 'cerrada' WHERE id = $1 AND empresa_id IS NOT NULL AND estado_publicacion = 'aprobada'`;
export const moderacionValida = (v: unknown): v is "aprobada" | "rechazada" => v === "aprobada" || v === "rechazada";
