// RGPD para empresas (B4-11): exportar y borrar los datos de una empresa (cuenta de acceso, ofertas, actividad).
// Solo para la terminal (rol `horma`). Una empresa no tiene datos en disco: todo está en la base.
//
// POR QUÉ el borrado no es un simple DELETE: borrar la empresa borraría en cascada sus ofertas, y las ofertas arrastran
// (ON DELETE CASCADE) las candidaturas y recomendaciones de las CANDIDATAS que las usaron, que son datos suyos. Por eso las
// ofertas con candidaturas o recomendaciones se conservan, cerradas y sin el nombre de la empresa ni la descripción; el resto
// se borra. Lo que recibió la empresa por el portal (envios_empresa) se borra siempre: es lo que la empresa tenía.
//
// Qué NO lleva la exportación: el contenido de las candidaturas recibidas (CV, carta, contacto de candidatas). Son datos de
// terceras personas, no de la empresa; solo se cuenta cuántas hay y su estado.

export const ID_EMPRESA_RGPD = /^[a-z0-9][a-z0-9_-]{0,79}$/;
export const idEmpresaValido = (id: unknown): id is string => typeof id === "string" && ID_EMPRESA_RGPD.test(id);

export const NOMBRE_BAJA = "Empresa dada de baja";

export const SQL_EXPORTAR_EMPRESA = {
  empresa: "SELECT jsonb_build_object('id', id, 'nombre', nombre, 'creada_en', creada_en) AS dato FROM empresas WHERE id = $1",
  // La cuenta SIN la contraseña ni su hash: solo lo que la empresa puede entender.
  cuenta: "SELECT jsonb_build_object('email', email, 'bloqueada_hasta', bloqueada_hasta, 'creada_en', creada_en) AS dato FROM cuentas_empresa WHERE empresa_id = $1",
  // Columnas explícitas (nunca to_jsonb): lo que la empresa escribió y el estado de su publicación; sin la auditoría interna.
  ofertas: "SELECT jsonb_agg(jsonb_build_object('id', o.id, 'titulo', o.titulo, 'descripcion', o.descripcion, 'ubicacion', o.ubicacion, 'remoto', o.remoto, 'contrato', o.contrato, 'idioma', o.idioma, 'nivel', o.nivel, 'requisitos', o.requisitos, 'salario', o.salario, 'avisos', o.avisos, 'estado_publicacion', o.estado_publicacion, 'motivo_rechazo', o.motivo_rechazo, 'creada_en', o.creada_en) ORDER BY o.creada_en) AS dato FROM ofertas o WHERE o.empresa_id = $1",
  // Solo cuántas y en qué estado; nunca CV, carta ni contacto de las candidatas.
  candidaturas_recibidas: "SELECT jsonb_agg(jsonb_build_object('oferta_id', oferta_id, 'estado_bandeja', estado_bandeja, 'enviado_en', enviado_en) ORDER BY enviado_en) AS dato FROM envios_empresa WHERE empresa_id = $1",
} as const;

// Una oferta «usada» por candidatas: tiene candidaturas o recomendaciones suyas. Esas no se borran.
const USADA = "(EXISTS (SELECT 1 FROM candidaturas c WHERE c.oferta_id = o.id) OR EXISTS (SELECT 1 FROM matches m WHERE m.oferta_id = o.id))";

/** Qué se perdería y qué se conserva (para el ensayo en seco). `$1` = id de la empresa. */
export const SQL_RESUMEN = `
  SELECT
    (SELECT count(*) FROM empresas WHERE id = $1)::int AS empresas,
    (SELECT count(*) FROM cuentas_empresa WHERE empresa_id = $1)::int AS cuentas,
    (SELECT count(*) FROM sesiones_empresa WHERE empresa_id = $1)::int AS sesiones,
    (SELECT count(*) FROM envios_empresa WHERE empresa_id = $1)::int AS candidaturas_recibidas,
    (SELECT count(*) FROM ofertas WHERE empresa_id = $1)::int AS ofertas,
    (SELECT count(*) FROM ofertas o WHERE o.empresa_id = $1 AND ${USADA})::int AS ofertas_conservadas`;

/** Orden obligatorio y dentro de UNA transacción. `$1` = id de la empresa, `$2` = NOMBRE_BAJA (solo el tercero lo usa). */
export const SQL_BORRAR_EMPRESA = [
  // 1) Lo recibido por la empresa (antes de desvincular las ofertas: la clave compuesta de envios_empresa lo exigiría).
  "DELETE FROM envios_empresa WHERE empresa_id = $1",
  // 2) Las ofertas que ninguna candidata usó, fuera.
  `DELETE FROM ofertas o WHERE o.empresa_id = $1 AND NOT ${USADA}`,
  // 3) Las que usaron candidatas se conservan: cerradas, sin nombre de la empresa, descripción, motivo de rechazo ni auditoría (puede citar trozos del texto), desvinculadas.
  `UPDATE ofertas SET empresa_id = NULL, empresa = $2, atribucion = $2, descripcion = NULL, motivo_rechazo = NULL, auditoria = '{}'::jsonb,
     requisitos = '[]'::jsonb, avisos = '[]'::jsonb, url = 'https://horma.invalid/oferta-dada-de-baja/' || id,
     fuente = 'empresa:baja',
     estado_publicacion = CASE WHEN estado_publicacion = 'aprobada' THEN 'cerrada'
                               WHEN estado_publicacion = 'pendiente_de_revision' THEN 'rechazada'
                               ELSE estado_publicacion END
   WHERE empresa_id = $1`,
  // 4) La empresa; su cuenta y sus sesiones se van en cascada.
  "DELETE FROM empresas WHERE id = $1",
] as const;
