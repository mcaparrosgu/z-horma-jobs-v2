// Candidaturas (Flujos D y E): consultas de las páginas /candidaturas/[id] y las dos escrituras que hace la usuaria
// con sesión: aprobar y marcar como enviada. Un agente nunca escribe «aprobada»: solo esta acción, con la sesión de ella.

export type FilaCandidatura = {
  oferta_id: string; estado: string; cv_usado: string; cv_md: string; carta_md: string | null;
  historial: { estado: string; fecha: string; por: string; canal?: string | null; motivo?: string | null }[];
  huecos: { requisito: string; propuesta: string; decision: string; relleno_aviso?: string | null }[];
  ats: { cobertura: number; faltantes_con_origen: string[]; faltantes_sin_origen: string[]; no_medidos?: string[] };
  actualizado_en: Date; titulo: string; empresa: string; url: string;
  empresa_id: string | null; estado_bandeja: string | null;
  preguntas_pendientes: unknown; // jsonb; se reduce con preguntasSinContestar (lib/preguntas.ts) antes de enseñarlo
  version_nueva: { cv_md: string; carta_md: string | null; huecos?: FilaCandidatura["huecos"] } | null;
  huella_version_nueva: string | null;
};

// Siempre filtrada por usuaria ($1). Sin traza: es para auditar en Claude Code, no para leer.
// empresa_id (de la oferta): si no es null, la candidatura es de una oferta publicada por una empresa en Horma y
// cabe «Enviar a la empresa» (bloque 4) en vez de «Marcar como enviada» a mano.
// estado_bandeja: lo pone la EMPRESA sobre el envío (recibida/vista/en_proceso/no_seleccionada); es solo información
// para la usuaria, nunca cambia el estado de su candidatura por sí solo.
export const SQL_CANDIDATURAS = `
  SELECT c.oferta_id, c.estado, c.cv_usado, c.cv_md, c.carta_md, c.historial, c.huecos, c.ats, c.preguntas_pendientes, c.actualizado_en, c.version_nueva, md5(c.version_nueva::text) AS huella_version_nueva,
         o.titulo, o.empresa, o.url, o.empresa_id, e.estado_bandeja
  FROM candidaturas c JOIN ofertas o ON o.id = c.oferta_id
  LEFT JOIN envios_empresa e ON e.usuaria_id = c.usuaria_id AND e.oferta_id = c.oferta_id
  WHERE c.usuaria_id = $1
  ORDER BY c.actualizado_en DESC, c.oferta_id`;

/** Respuestas del perfil de la usuaria (RLS: solo la suya). Sirven para ocultar las preguntas que ya contestó. */
export const SQL_RESPUESTAS_PERFIL = `SELECT respuestas FROM perfiles WHERE usuaria_id = $1`;

export const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "borrador: falta que tú la revises y apruebes",
  pendiente_de_ti: "pendiente de ti: no pasó el control y necesita tu decisión",
  aprobada: "aprobada por ti",
  enviada: "enviada",
  entrevista: "entrevista",
  rechazada: "rechazada",
  sin_respuesta: "sin respuesta",
  descartada: "descartada",
};

/** Huecos a enseñar PRIMERO: los que Horma reformuló o rellenó (regla de los huecos). */
export const huecosConAviso = (h: FilaCandidatura["huecos"]) => h.filter((x) => x.relleno_aviso);
export const huecosSinCubrir = (h: FilaCandidatura["huecos"]) => h.filter((x) => !x.relleno_aviso);
export const porcentaje = (c: number) => `${Math.round(Math.min(1, Math.max(0, c)) * 100)} %`;

// --- Escrituras de la usuaria (bloque 4). El estado solo avanza en orden: borrador → aprobada → enviada. ---
// Todo va filtrado por la usuaria de la SESIÓN ($1), nunca por un dato del formulario.
const HOY = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')";

export const SQL_APROBAR = `
  UPDATE candidaturas SET estado = 'aprobada',
    historial = historial || jsonb_build_array(jsonb_build_object('estado', 'aprobada', 'fecha', ${HOY}, 'por', 'usuaria')),
    actualizado_en = now()
  -- $3 = la versión que ella estaba leyendo: si el borrador cambió entre medias, no se aprueba un texto que no vio.
  WHERE usuaria_id = $1 AND oferta_id = $2 AND estado = 'borrador' AND date_trunc('milliseconds', actualizado_en) = $3::timestamptz`;

export const SQL_MARCAR_ENVIADA = `
  UPDATE candidaturas SET estado = 'enviada',
    historial = historial || jsonb_build_array(jsonb_build_object('estado', 'enviada', 'fecha', ${HOY}, 'por', 'usuaria', 'canal', $3::text)),
    actualizado_en = now()
  WHERE usuaria_id = $1 AND oferta_id = $2 AND estado = 'aprobada'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(historial) e WHERE e->>'estado' = 'aprobada' AND e->>'por' = 'usuaria')`;

/** Lista cerrada: el canal no es texto libre. «portal de Horma» lo pone enviarAEmpresa (bloque 4), nunca la usuaria. */
export const CANALES = ["web de la empresa", "correo", "LinkedIn", "Indeed", "otro"] as const;
export const CANAL_PORTAL = "portal de Horma";
export const canalValido = (c: unknown): c is (typeof CANALES)[number] => typeof c === "string" && (CANALES as readonly string[]).includes(c);
export const ID_OFERTA = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/;

export const ETIQUETA_BANDEJA: Record<string, string> = {
  recibida: "recibida por la empresa", vista: "vista por la empresa", en_proceso: "en proceso en la empresa",
  no_seleccionada: "no seleccionada por la empresa",
};

// --- Seguimiento (bloque 2, construcción autónoma): la usuaria registra la respuesta de la empresa. --------------
// Los mismos pares que hace cumplir el disparador `candidaturas_transicion` (migración 017): si se cambia aquí sin
// cambiar la migración (o al revés), esta consulta deja de mover filas, nunca se cuela una transición no permitida.
export const DESTINOS_VALIDOS: Readonly<Record<string, readonly string[]>> = {
  enviada: ["entrevista", "rechazada", "sin_respuesta"],
  entrevista: ["rechazada"],
  borrador: ["descartada"],
  aprobada: ["descartada"],
  pendiente_de_ti: ["descartada"],
};
export const destinosDe = (estado: string): readonly string[] => DESTINOS_VALIDOS[estado] ?? [];
export const NOTA_MAX = 300;
export const DIAS_SIN_RESPUESTA = 21;

/** Aviso informativo, calculado al mostrar (no hay tareas programadas): solo si sigue «enviada» tras N días. */
export const sinRespuestaTrasDias = (estado: string, actualizadoEn: Date, ahora = new Date()): boolean =>
  estado === "enviada" && ahora.getTime() - actualizadoEn.getTime() >= DIAS_SIN_RESPUESTA * 24 * 3600 * 1000;

export const SQL_REGISTRAR_RESPUESTA = `
  UPDATE candidaturas SET estado = $3,
    historial = historial || jsonb_build_array(jsonb_build_object('estado', $3::text, 'fecha', ${HOY}, 'por', 'usuaria', 'motivo', $4::text)),
    actualizado_en = now()
  WHERE usuaria_id = $1 AND oferta_id = $2
    AND (
      (estado = 'enviada' AND $3 IN ('entrevista', 'rechazada', 'sin_respuesta'))
      OR (estado = 'entrevista' AND $3 = 'rechazada')
      OR (estado IN ('borrador', 'aprobada', 'pendiente_de_ti') AND $3 = 'descartada')
    )`;
