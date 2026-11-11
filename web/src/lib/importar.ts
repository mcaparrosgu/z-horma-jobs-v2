// Piezas puras del importador de datos: pasan un JSON ya validado a los parámetros de cada INSERT.
// Sin acceso a disco ni a red, para poder probarlas con `npm test`.

import { huellas, urlCanonica } from "./calidad-ofertas.ts";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Las columnas jsonb se pasan como texto: si no, `pg` convierte los arrays de JS en arrays de Postgres.
import { respuestasImportables } from "./respuestas.ts";
import { preguntasImportables } from "./preguntas.ts";
const j = (v: unknown) => JSON.stringify(v);

export const SQL_OFERTA = `
  INSERT INTO ofertas (id, fuente, url, fecha, titulo, empresa, ubicacion, pais, remoto, contrato,
                       idioma, nivel, sector, familia, requisitos, salario, stack, auditoria, avisos, licencia, atribucion, ejecucion_id,
                       url_canonica, huella_base, huella, grupo_dedup, fecha_cierre)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20,$21,$22,
          $23,$24,$25,$26,$27)
  ON CONFLICT (id) DO UPDATE SET
    fuente=EXCLUDED.fuente, url=EXCLUDED.url, fecha=EXCLUDED.fecha, titulo=EXCLUDED.titulo,
    empresa=EXCLUDED.empresa, ubicacion=EXCLUDED.ubicacion, pais=EXCLUDED.pais,
    remoto=EXCLUDED.remoto, contrato=EXCLUDED.contrato, idioma=EXCLUDED.idioma, nivel=EXCLUDED.nivel,
    sector=EXCLUDED.sector, familia=EXCLUDED.familia, requisitos=EXCLUDED.requisitos,
    salario=EXCLUDED.salario, stack=EXCLUDED.stack, auditoria=EXCLUDED.auditoria,
    avisos=EXCLUDED.avisos, licencia=EXCLUDED.licencia, atribucion=EXCLUDED.atribucion,
    ejecucion_id=COALESCE(EXCLUDED.ejecucion_id, ofertas.ejecucion_id),
    url_canonica=EXCLUDED.url_canonica, huella_base=EXCLUDED.huella_base, huella=EXCLUDED.huella,
    grupo_dedup=EXCLUDED.grupo_dedup, fecha_cierre=EXCLUDED.fecha_cierre,
    -- Calidad (A1): al volver a verla se cuenta y se refresca; primera_vista no se toca (la puso el INSERT).
    ultima_vista=now(), veces_vista=ofertas.veces_vista + 1`;

/** `ejecucionId`: la ejecución de ingesta que la trae (null si su fuente no está en endpoints.json, p. ej. las de prueba). */
export function paramsOferta(o: Json, ejecucionId: number | string | null = null): unknown[] {
  const t = o.taxonomia ?? {};
  const h = huellas({ empresa: o.empresa, titulo: o.titulo, ubicacion: o.ubicacion, fecha: o.fecha ?? null });
  return [
    o.id, o.fuente, o.url, o.fecha ?? null, o.titulo, o.empresa, o.ubicacion, o.pais ?? null,
    o.remoto, o.contrato, o.idioma, o.nivel, t.sector ?? null, t.familia ?? null,
    j(o.requisitos ?? []), j(o.salario), j(t.stack ?? []), j(o.auditoria), j(o.avisos ?? []),
    o.origen?.licencia ?? null, o.origen?.atribucion ?? null, ejecucionId,
    // Calidad de ofertas (A1). El grupo de duplicados es la propia huella; nada se borra al agrupar.
    urlCanonica(o.url), h.huellaBase, h.huella, h.huella, o.fecha_cierre ?? null,
  ];
}

export const SQL_USUARIA = `INSERT INTO usuarias (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`;

// Perfil y preferencias las edita la usuaria en la web: por defecto NO se pisan (DO NOTHING).
// Solo con --forzar se sobrescriben con lo que haya en disco (hallazgo A del revisor).
export const sqlPerfil = (forzar: boolean) => `
  INSERT INTO perfiles (usuaria_id, experiencias, formacion, skills, idiomas, taxonomia,
                        preguntas_pendientes, instrucciones_embebidas, cv_texto, respuestas)
  VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10::jsonb)
  ON CONFLICT (usuaria_id) ${forzar ? `DO UPDATE SET
    cv_texto=EXCLUDED.cv_texto,
    experiencias=EXCLUDED.experiencias, formacion=EXCLUDED.formacion, skills=EXCLUDED.skills,
    idiomas=EXCLUDED.idiomas, taxonomia=EXCLUDED.taxonomia,
    preguntas_pendientes=EXCLUDED.preguntas_pendientes,
    instrucciones_embebidas=EXCLUDED.instrucciones_embebidas, actualizado_en=now()`
    // `respuestas` nunca se pisa, ni con --forzar: una vez creado el perfil manda la web (si no, reaparecería lo que ella borró).
    // Sin --forzar solo se rellena el texto del CV si aún no lo había: nunca se pisa lo que ella editó.
    : `DO UPDATE SET cv_texto=EXCLUDED.cv_texto WHERE perfiles.cv_texto IS NULL AND EXCLUDED.cv_texto IS NOT NULL`}`;

export function paramsPerfil(p: Json, cvTexto: string | null = null): unknown[] {
  return [
    p.usuaria_id, j(p.experiencias), j(p.formacion), j(p.skills), j(p.idiomas), j(p.taxonomia),
    j(p.preguntas_pendientes), j(p.instrucciones_embebidas ?? []), cvTexto, j(respuestasImportables(p.respuestas)),
  ];
}

export const sqlPreferencias = (forzar: boolean) => `
  INSERT INTO preferencias (usuaria_id, puestos, ciudades, paises, remoto, contrato, idiomas,
                            sectores, niveles, horario, sueldo_min, rango_compatibilidad)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  ON CONFLICT (usuaria_id) ${forzar ? `DO UPDATE SET
    puestos=EXCLUDED.puestos, ciudades=EXCLUDED.ciudades, paises=EXCLUDED.paises,
    remoto=EXCLUDED.remoto, contrato=EXCLUDED.contrato, idiomas=EXCLUDED.idiomas,
    sectores=EXCLUDED.sectores, niveles=EXCLUDED.niveles, horario=EXCLUDED.horario, sueldo_min=EXCLUDED.sueldo_min,
    rango_compatibilidad=EXCLUDED.rango_compatibilidad, actualizado_en=now()` : "DO NOTHING"}`;

/** preferencias.json no trae el id de la usuaria: viene del nombre de su carpeta. */
export function paramsPreferencias(usuariaId: string, p: Json): unknown[] {
  return [
    usuariaId, p.puestos ?? [], p.ciudades ?? [], p.paises ?? [], p.remoto ?? [], p.contrato ?? [],
    p.idiomas ?? [], p.sectores ?? [], p.niveles ?? [], p.horario ?? [], p.sueldo_min ?? null, p.rango_compatibilidad,
  ];
}

// --- Observabilidad -------------------------------------------------------------------------
// `eventos.detalle` NUNCA lleva datos personales: solo estas claves, y solo números.
export const CLAVES_DETALLE = ["archivos", "importadas", "omitidas", "rechazadas", "coinciden", "fallos", "avisos"] as const;

// Componentes y acciones permitidos: cada uno nuevo se añade aquí, a propósito (hallazgo C).
export const COMPONENTES = ["importador", "verificador", "web-ingesta", "web-candidatos", "web-acceso", "web-cuenta", "web-empresa"] as const;
export const ACCIONES = ["importar-datos", "verificar", "guardar-fuente", "guardar-preferencias", "entrar", "registrar", "entrar-google", "aprobar", "marcar-enviada", "cambiar-contrasena", "borrar-cuenta", "descargar-datos", "registrar-respuesta", "entrar-empresa", "publicar-oferta", "editar-oferta", "cerrar-oferta", "moderar-oferta", "enviar-a-empresa", "retirar-envio", "cambiar-estado-bandeja", "aceptar-version-nueva", "descartar-version-nueva"] as const;

export type EventoEntrada = {
  componente: (typeof COMPONENTES)[number];
  accion: (typeof ACCIONES)[number];
  resultado: "ok" | "error";
  duracion_ms?: number;
  detalle?: Record<string, number>;
};

/** Deja pasar solo las claves de la lista cerrada y solo si el valor es un número. */
export function detalleSeguro(detalle: Record<string, unknown> = {}): Record<string, number> {
  const limpio: Record<string, number> = {};
  for (const k of CLAVES_DETALLE) {
    const v = detalle[k];
    if (typeof v === "number" && Number.isFinite(v)) limpio[k] = v;
  }
  return limpio;
}

/** Texto de un error de la base de datos SIN el mensaje: puede repetir el valor que falló (hallazgo B). */
export function errorSeguro(e: unknown): string {
  const { code, constraint } = (e ?? {}) as { code?: unknown; constraint?: unknown };
  const partes = [typeof code === "string" ? `código ${code}` : "error inesperado"];
  if (typeof constraint === "string") partes.push(`restricción ${constraint}`);
  return partes.join(", ");
}

export async function registrarEvento(
  db: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  e: EventoEntrada,
): Promise<void> {
  // Los tipos de TypeScript desaparecen al ejecutar: se vuelve a comprobar en tiempo de ejecución.
  if (!(COMPONENTES as readonly string[]).includes(e.componente)) throw new Error("componente no permitido");
  if (!(ACCIONES as readonly string[]).includes(e.accion)) throw new Error("acción no permitida");
  if (e.resultado !== "ok" && e.resultado !== "error") throw new Error("resultado no permitido");
  const ms = e.duracion_ms === undefined || !Number.isFinite(e.duracion_ms) ? null : Math.max(0, Math.trunc(e.duracion_ms));
  await db.query(
    `INSERT INTO eventos (componente, accion, resultado, duracion_ms, detalle) VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [e.componente, e.accion, e.resultado, ms, JSON.stringify(detalleSeguro(e.detalle))],
  );
}

// Recomendaciones (esquema match): una fila por (usuaria, oferta, versión de perfil). Repetible: no duplica.
export const SQL_MATCH = `
  INSERT INTO matches (usuaria_id, oferta_id, version_perfil, fecha, nota, nivel_condiciones, explicacion, sin_sueldo, correccion)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  ON CONFLICT (usuaria_id, oferta_id, version_perfil) DO UPDATE SET
    fecha=EXCLUDED.fecha, nota=EXCLUDED.nota, nivel_condiciones=EXCLUDED.nivel_condiciones,
    explicacion=EXCLUDED.explicacion, sin_sueldo=EXCLUDED.sin_sueldo,
    correccion=COALESCE(EXCLUDED.correccion, matches.correccion)`;

export function paramsMatch(m: Json, o: Json): unknown[] {
  return [m.usuaria_id, o.oferta_id, m.version_perfil, m.fecha, o.nota, o.nivel_condiciones, o.explicacion, o.sin_sueldo ?? false, o.correccion ?? null];
}

// Candidaturas (esquema candidatura + cv.md y carta.md): una fila por (usuaria, oferta). Repetible: no duplica.
export const SQL_CANDIDATURA = `
  INSERT INTO candidaturas (usuaria_id, oferta_id, estado, cv_usado, cv_md, carta_md, historial, traza, traza_carta, huecos, ats, preguntas_pendientes)
  VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb)
  ON CONFLICT (usuaria_id, oferta_id) DO UPDATE SET
    estado=EXCLUDED.estado, cv_usado=EXCLUDED.cv_usado, cv_md=EXCLUDED.cv_md, carta_md=EXCLUDED.carta_md,
    historial=EXCLUDED.historial, traza=EXCLUDED.traza, traza_carta=EXCLUDED.traza_carta,
    huecos=EXCLUDED.huecos, ats=EXCLUDED.ats, preguntas_pendientes=EXCLUDED.preguntas_pendientes, actualizado_en=now()
  -- Una reimportación nunca degrada una candidatura ya aprobada o enviada: solo se actualizan borradores.
  WHERE candidaturas.estado IN ('borrador','pendiente_de_ti')`;

// Reimportar sobre una candidatura YA APROBADA: no se toca el texto aprobado; la versión nueva queda aparte y solo la
// usuaria (con su sesión, función resolver_version_nueva, migración 027) decide si la acepta. Si el texto es igual, se
// limpia cualquier versión pendiente. Una «enviada» o posterior no admite versión nueva.
export const SQL_VERSION_NUEVA = `
  UPDATE candidaturas SET version_nueva = CASE
    WHEN cv_md IS DISTINCT FROM ($3::jsonb->>'cv_md') OR carta_md IS DISTINCT FROM ($3::jsonb->>'carta_md') THEN $3::jsonb
    ELSE NULL END
  WHERE usuaria_id = $1 AND oferta_id = $2 AND estado = 'aprobada'`;

export function paramsVersionNueva(usuariaId: string, ofertaId: string, c: Json, cvMd: string, cartaMd: string | null, trazaCarta: unknown): unknown[] {
  const v = { cv_usado: c.cv_usado, cv_md: cvMd, carta_md: cartaMd, traza: c.traza, traza_carta: trazaCarta ?? null, huecos: c.huecos, ats: c.ats };
  return [usuariaId, ofertaId, JSON.stringify(v)];
}

export function paramsCandidatura(usuariaId: string, ofertaId: string, c: Json, cvMd: string, cartaMd: string | null, trazaCarta: unknown): unknown[] {
  return [usuariaId, ofertaId, c.estado, c.cv_usado, cvMd, cartaMd, j(c.historial), j(c.traza),
    trazaCarta === null || trazaCarta === undefined ? null : j(trazaCarta), j(c.huecos), j(c.ats), j(preguntasImportables(c.preguntas_pendientes))];
}

/**
 * Línea roja: un agente nunca aprueba. Desde el bloque 4 la aprobación y el envío SOLO los escribe la web, con la sesión de la
 * usuaria; un archivo (que puede escribir un agente) solo puede traer borradores. Devuelve el motivo del rechazo, o null.
 */
export function incoherenciaCandidatura(c: Json): string | null {
  const h: Json[] = Array.isArray(c.historial) ? c.historial : [];
  if (c.estado !== "borrador" && c.estado !== "pendiente_de_ti") return "desde archivos solo entran borradores: aprobar y enviar se hace en la web, con tu sesión";
  if (h.some((e) => e.estado === "aprobada" || e.estado === "enviada")) return "el historial de un archivo no puede traer aprobaciones ni envíos";
  return null;
}

/** medir_ats.py deja una clave de trabajo (`presentes`) que no se guarda; `no_medidos` sí (esquema 0.10), solo si es lista de textos. */
export function soloClavesAts(a: Json): Json {
  const r: Json = { cobertura: a?.cobertura, faltantes_con_origen: a?.faltantes_con_origen, faltantes_sin_origen: a?.faltantes_sin_origen };
  if (Array.isArray(a?.no_medidos) && a.no_medidos.every((x: unknown) => typeof x === "string")) r.no_medidos = a.no_medidos;
  return r;
}
