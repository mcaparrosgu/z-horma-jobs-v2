// Recomendaciones (Flujo C): consulta de la página /recomendaciones/[id]. Solo lectura.
// La nota es solo experiencia y formación; nivel_condiciones, solo condiciones de trabajo (esquema match).

import { RECURRENTE_SQL, RANGO_LICENCIA_SQL } from "./consultas.ts";

export type FilaMatch = {
  oferta_id: string; version_perfil: string; fecha: Date; nota: number | null;
  nivel_condiciones: "encaja" | "parcial" | "no"; explicacion: string; sin_sueldo: boolean; correccion: string | null;
  titulo: string; empresa: string; ubicacion: string; pais: string | null; remoto: string; url: string;
  avisos: { tipo: string; texto: string }[];
  // Etiqueta de transparencia (A1): solo hechos de la oferta.
  fuente: string; licencia: string | null; fecha_oferta: Date | null; primera_vista: Date | null; ultima_vista: Date | null;
  veces_vista: number; fecha_oferta_texto: string | null; fecha_cierre_texto: string | null; recurrente: boolean;
};

// Solo la versión de perfil más reciente de la usuaria; ordenadas por nota (las «sin nota» al final). Siempre filtrada por usuaria ($1).
// A1: no se recomienda una oferta cerrada (fecha_cierre pasada) ni una marcada como posible fraude (orden de Mar, 10-nov) y un grupo de duplicados sale una sola vez, con la fila de
// mejor licencia (empresa > socio > abierto) y, a igualdad, la más reciente; las demás siguen guardadas. La nota no cambia.
export const SQL_MATCHES = `
  SELECT m.*, m.fecha_oferta::text AS fecha_oferta_texto, m.fecha_cierre::text AS fecha_cierre_texto,
         ${RECURRENTE_SQL("m", "fecha_oferta")} AS recurrente
  FROM (
    SELECT DISTINCT ON (grupo) *
    FROM (
      SELECT m.oferta_id, m.version_perfil, m.fecha, m.nota, m.nivel_condiciones, m.explicacion, m.sin_sueldo, m.correccion,
             o.titulo, o.empresa, o.ubicacion, o.pais, o.remoto, o.url, o.avisos,
             o.fuente, o.licencia, o.fecha AS fecha_oferta, o.primera_vista, o.ultima_vista, o.veces_vista, o.fecha_cierre,
             o.huella_base, o.creada_en AS oferta_creada_en, COALESCE(o.grupo_dedup, o.id) AS grupo,
             ${RANGO_LICENCIA_SQL.replace("licencia", "o.licencia")} AS rango
      FROM matches m JOIN ofertas o ON o.id = m.oferta_id
      WHERE m.usuaria_id = $1 AND o.estado_publicacion = 'aprobada'
        AND (o.fecha_cierre IS NULL OR o.fecha_cierre >= current_date)
        AND NOT COALESCE((o.auditoria->'fraude'->>'sospechosa')::boolean, false)
        AND m.version_perfil = (SELECT version_perfil FROM matches WHERE usuaria_id = $1 ORDER BY fecha DESC, char_length(version_perfil) DESC, version_perfil DESC LIMIT 1)
    ) c
    ORDER BY grupo, rango DESC, fecha_oferta DESC NULLS LAST, oferta_creada_en DESC, oferta_id
  ) m
  ORDER BY m.nota DESC NULLS LAST, m.titulo, m.oferta_id`;

// Cuántas recomendaciones tiene la versión de perfil vigente antes de quitar cerradas y repetidas (para avisar de las ocultas).
export const SQL_MATCHES_TOTAL = `
  SELECT count(*)::text AS n FROM matches m JOIN ofertas o ON o.id = m.oferta_id
  WHERE m.usuaria_id = $1 AND o.estado_publicacion = 'aprobada'
    AND NOT COALESCE((o.auditoria->'fraude'->>'sospechosa')::boolean, false)
    AND m.version_perfil = (SELECT version_perfil FROM matches WHERE usuaria_id = $1 ORDER BY fecha DESC, char_length(version_perfil) DESC, version_perfil DESC LIMIT 1)`;

export const ETIQUETA_CONDICIONES: Record<FilaMatch["nivel_condiciones"], string> = {
  encaja: "las condiciones encajan", parcial: "condiciones a revisar", no: "las condiciones no encajan",
};

/**
 * Un enlace solo se pinta si es http(s); lo demás se muestra como texto plano.
 * Las ofertas de empresa guardan como `url` la lista de Horma (`<url de Horma>/ofertas`), que no lleva a la oferta:
 * ese enlace propio tampoco se pinta (solo si el servidor es el propio: localhost, 127.0.0.1 o el de HORMA_URL).
 */
export const enlaceSeguro = (u: string) => /^https?:\/\//i.test(u) && !esListaPropia(u);

function esListaPropia(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.pathname.replace(/\/+$/, "") !== "/ofertas" || url.search || url.hash) return false;
    const propios = new Set(["localhost", "127.0.0.1"]);
    if (process.env.HORMA_URL) propios.add(new URL(process.env.HORMA_URL).hostname);
    return propios.has(url.hostname);
  } catch {
    return false;
  }
}
