// Consultas de lectura de la web de ingesta. Todo con parámetros ($1, $2…): el dato nunca se pega al SQL.
import { DIAS_SIN_VER } from "./calidad-ofertas.ts";

export type FiltrosOfertas = {
  q?: string; pais?: string; nivel?: string; remoto?: string; sector?: string; familia?: string;
};

export const NIVELES = ["practicas", "junior", "medio", "senior", "direccion", "no_indicado"] as const;
export const REMOTOS = ["presencial", "hibrido", "remoto", "no_indicado"] as const;
export const LIMITE_OFERTAS = 50;

const escapaLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Convierte los filtros de la URL en un WHERE seguro. Lo que no encaja con la lista permitida se ignora. */
export function construirFiltro(f: FiltrosOfertas): { where: string; params: unknown[] } {
  const cond: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); cond.push(sql.replace("?", `$${params.length}`)); };

  const q = f.q?.trim().slice(0, 80);
  if (q) {
    params.push(`%${escapaLike(q)}%`);
    cond.push(`(titulo ILIKE $${params.length} OR empresa ILIKE $${params.length})`);
  }
  if (f.pais && /^[A-Z]{2}$/.test(f.pais)) add("pais = ?", f.pais);
  if (f.nivel && (NIVELES as readonly string[]).includes(f.nivel)) add("nivel = ?", f.nivel);
  if (f.remoto && (REMOTOS as readonly string[]).includes(f.remoto)) add("remoto = ?", f.remoto);
  if (f.sector) add("sector = ?", f.sector.slice(0, 80));
  if (f.familia) add("familia = ?", f.familia.slice(0, 80));
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", params };
}

// Toda oferta de empresa nace pendiente_de_revision (migración 018) y no aparece aquí hasta que administración
// la aprueba: por eso esta condición va SIEMPRE, se filtre o no por lo demás.
const APROBADA = "estado_publicacion = 'aprobada'";
// Regla 1 de vigencia (A1): una oferta con fecha de cierre pasada no sale por defecto. Se calcula al mostrar.
const NO_CERRADA = "(fecha_cierre IS NULL OR fecha_cierre >= current_date)";
export const VISIBLE = `${APROBADA} AND ${NO_CERRADA}`;

// Duplicados (A1, capas 1-2): se muestra UNA fila por grupo, la de mejor licencia (empresa > socio > abierto) y, a igualdad,
// la más reciente. Las demás NO se borran: siguen en la base con su licencia y atribución, y la lista dice en qué otras
// fuentes aparece. Una oferta sin grupo (grupo_dedup nulo) es su propio grupo.
export const RANGO_LICENCIA_SQL = "CASE licencia WHEN 'empresa' THEN 3 WHEN 'socio' THEN 2 WHEN 'abierto' THEN 1 ELSE 0 END";
const COLUMNAS = `id, fuente, url, fecha, titulo, empresa, ubicacion, pais, remoto, nivel, sector, familia,
                  salario, stack, auditoria, licencia, atribucion, avisos, creada_en,
                  primera_vista, ultima_vista, veces_vista, fecha_cierre, huella_base`;
// Regla 3: la misma huella base (empresa + título + municipio) con fecha en otra semana → «oferta recurrente».
export const RECURRENTE_SQL = (alias: string, columnaFecha = "fecha") => `EXISTS (SELECT 1 FROM ofertas r WHERE r.huella_base = ${alias}.huella_base
    AND r.estado_publicacion = 'aprobada' AND r.fecha IS NOT NULL AND ${alias}.${columnaFecha} IS NOT NULL
    AND date_trunc('week', r.fecha) <> date_trunc('week', ${alias}.${columnaFecha}))`;

export function sqlOfertas(f: FiltrosOfertas): { sql: string; params: unknown[] } {
  const { where, params } = construirFiltro(f);
  const whereFinal = where ? `${where} AND ${VISIBLE}` : `WHERE ${VISIBLE}`;
  params.push(DIAS_SIN_VER);
  const umbral = `$${params.length}`;
  return {
    sql: `WITH visibles AS (
            SELECT ${COLUMNAS}, COALESCE(grupo_dedup, id) AS grupo, ${RANGO_LICENCIA_SQL} AS rango,
                   array_agg(fuente) OVER (PARTITION BY COALESCE(grupo_dedup, id)) AS fuentes_grupo
            FROM ofertas ${whereFinal}
          ), uno AS (
            SELECT DISTINCT ON (grupo) * FROM visibles ORDER BY grupo, rango DESC, fecha DESC NULLS LAST, creada_en DESC, id
          )
          -- Las fechas también como texto: un date de pg llega como Date a medianoche local y toISOString() lo desplaza un día.
          SELECT u.*, u.fecha::text AS fecha_texto, u.fecha_cierre::text AS fecha_cierre_texto, ${RECURRENTE_SQL("u")} AS recurrente
          FROM uno u
          -- Regla 2: las que llevan más de ${DIAS_SIN_VER} días sin verse bajan en el orden (siguen visibles).
          ORDER BY COALESCE((current_date - COALESCE(u.ultima_vista::date, u.fecha)) > ${umbral}::int, false),
                   u.fecha DESC NULLS LAST, u.creada_en DESC, u.id
          LIMIT ${LIMITE_OFERTAS}`,
    params,
  };
}

// Ofertas distintas (un grupo de duplicados cuenta una vez) y no cerradas.
export const SQL_TOTAL_OFERTAS = `SELECT count(DISTINCT COALESCE(grupo_dedup, id))::int AS n FROM ofertas WHERE ${VISIBLE}`;
export const SQL_OPCIONES = `
  SELECT 'pais' AS campo, pais AS valor FROM ofertas WHERE pais IS NOT NULL AND ${VISIBLE} GROUP BY pais
  UNION ALL SELECT 'sector', sector FROM ofertas WHERE sector IS NOT NULL AND ${VISIBLE} GROUP BY sector
  UNION ALL SELECT 'familia', familia FROM ofertas WHERE familia IS NOT NULL AND ${VISIBLE} GROUP BY familia
  ORDER BY 1, 2`;
export const SQL_FUENTES = `SELECT nombre, url, parametros, cabeceras, clave_env, clave_en, clave_nombre, mapeo_campos, activa
                            FROM fuentes ORDER BY nombre`;
export const SQL_EJECUCIONES = `SELECT id, fuente, inicio, fin, entraron, descartadas, errores
                             FROM ejecuciones_ingesta ORDER BY inicio DESC LIMIT 50`;
