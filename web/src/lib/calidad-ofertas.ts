// Calidad de ofertas (A1): identidad exacta (URL canónica), huella determinista para agrupar duplicados y reglas de
// vigencia. Todo son funciones puras y deterministas: sin red, sin LLM y sin reloj escondido (la fecha de hoy se pasa
// como argumento). Nunca un modelo decide si una oferta está «caducada»; solo hechos que se pueden comprobar.
import { createHash } from "node:crypto";

// ---------- Capa 1: URL canónica ----------

const PARAMS_SEGUIMIENTO = /^(utm_.*|fbclid|gclid)$/i;

/** URL en forma canónica: esquema y host en minúsculas, sin fragmento, sin parámetros de seguimiento (utm_*, fbclid,
 *  gclid), parámetros restantes ordenados y sin barra final. Si no es una URL válida devuelve el texto recortado en
 *  minúsculas (nunca lanza). */
export function urlCanonica(url: string): string {
  const texto = (url ?? "").trim();
  let u: URL;
  try { u = new URL(texto); } catch { return texto.toLowerCase(); }
  u.hash = "";
  const quedan = [...u.searchParams.entries()].filter(([k]) => !PARAMS_SEGUIMIENTO.test(k));
  quedan.sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
  u.search = "";
  for (const [k, v] of quedan) u.searchParams.append(k, v);
  const ruta = u.pathname.replace(/\/+$/, "");
  // `URL` ya pone esquema y host en minúsculas y quita el puerto por defecto; la ruta y la consulta conservan su caso.
  return `${u.protocol}//${u.host}${ruta}${u.search}`;
}

// ---------- Capa 2: huella determinista ----------

/** Minúsculas, sin tildes, con los signos como espacios y espacios colapsados. */
function base(s: string): string {
  return (s ?? "").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

// «(m/f)», «m/f», «(h/m/d)», «h/m», «(f/m/x)»…: marcas de género en el título, no forman parte del puesto.
const MARCA_GENERO = /\(?\s*\b[mfhdx]\s*(?:\/|\\)\s*[mfhdx](?:\s*(?:\/|\\)\s*[mfhdx])*\b\s*\)?/giu;

export function normalizarTitulo(titulo: string): string {
  const sinTildes = (titulo ?? "").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
  return base(sinTildes.replace(MARCA_GENERO, " "));
}

// Formas jurídicas que se quitan al FINAL del nombre de la empresa (ya normalizado). Las de una letra van en grupos
// («s l», «s a u») porque la normalización convierte «S.L.» en «s l».
const FORMAS_JURIDICAS = [
  "s l u", "s l p", "s l l", "s a u", "s l", "s a", "s c p", "slu", "slp", "sll", "sau", "sl", "sa", "scp",
  "ltd", "gmbh", "ab", "inc", "llc",
];

export function normalizarEmpresa(empresa: string): string {
  let e = base(empresa);
  for (let seguir = true; seguir;) {
    seguir = false;
    for (const f of FORMAS_JURIDICAS) {
      if (e === f) continue; // un nombre que es solo la forma jurídica no se vacía
      if (e.endsWith(` ${f}`)) { e = e.slice(0, -(f.length + 1)).trim(); seguir = true; break; }
    }
  }
  return e;
}

/** Municipio: lo que va antes de la primera coma, guion o paréntesis de la ubicación («Madrid, España» → «madrid»). */
export function normalizarMunicipio(ubicacion: string): string {
  const primero = (ubicacion ?? "").split(/[,(\-–/]/)[0];
  return base(primero);
}

/** Semana ISO (lunes a domingo) de una fecha AAAA-MM-DD, como «2026-W45»; «sin-fecha» si falta o no es válida. */
export function semanaDe(fecha: string | Date | null | undefined): string {
  if (!fecha) return "sin-fecha";
  const texto = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return "sin-fecha";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) return "sin-fecha";
  const dia = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dia + 3); // el jueves de esa semana fija el año ISO
  const año = d.getUTCFullYear();
  const primerJueves = new Date(Date.UTC(año, 0, 4));
  const semana = 1 + Math.round(((d.getTime() - primerJueves.getTime()) / 86400000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
  return `${año}-W${String(semana).padStart(2, "0")}`;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export type EntradaHuella = { empresa: string; titulo: string; ubicacion: string; fecha?: string | Date | null };

/** `huellaBase`: empresa + título + municipio (sirve para reconocer una oferta que reaparece en otra semana).
 *  `huella`: la anterior más la semana de `fecha`; misma huella = mismo grupo de duplicados. */
export function huellas(o: EntradaHuella): { huellaBase: string; huella: string } {
  const clave = [normalizarEmpresa(o.empresa), normalizarTitulo(o.titulo), normalizarMunicipio(o.ubicacion)].join("|");
  const huellaBase = sha(clave);
  return { huellaBase, huella: sha(`${clave}|${semanaDe(o.fecha)}`) };
}

// Qué fila representa a un grupo de duplicados se decide en SQL (`consultas.ts` y `matches.ts`): mejor licencia
// (empresa > socio > abierto) y, a igualdad, la más reciente. Una sola implementación; la prueba contra la base real
// comprueba que ninguna fila se pierde.

// ---------- Reglas de vigencia (se calculan al mostrar, sin tareas programadas) ----------

/** Días sin verla (o desde su fecha) a partir de los cuales se avisa «puede no estar vigente». */
export const DIAS_SIN_VER = 45;

export type EntradaVigencia = {
  fecha_cierre?: string | null; ultima_vista?: string | Date | null; fecha?: string | Date | null;
  primera_vista?: string | Date | null; veces_vista?: number | null; recurrente?: boolean;
  fuente?: string; licencia?: string | null;
};

const dia = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const diasEntre = (desde: string, hasta: string) => Math.floor((Date.parse(hasta) - Date.parse(desde)) / 86400000);

export type Vigencia = { cerrada: boolean; puedeNoEstarVigente: boolean; recurrente: boolean; diasSinVer: number | null };

/** Reglas: (1) `fecha_cierre` anterior a hoy → cerrada; (2) más de 45 días desde `ultima_vista` (o, si no hay, desde
 *  `fecha`) → puede no estar vigente; (3) `recurrente` (misma huella base en semanas distintas, calculado con la lista).
 *  `hoy` es AAAA-MM-DD: nunca se lee el reloj aquí. */
export function vigencia(o: EntradaVigencia, hoy: string): Vigencia {
  const cierre = dia(o.fecha_cierre);
  const cerrada = cierre !== null && cierre < hoy;
  const referencia = dia(o.ultima_vista) ?? dia(o.fecha);
  const diasSinVer = referencia ? diasEntre(referencia, hoy) : null;
  return {
    cerrada,
    puedeNoEstarVigente: !cerrada && diasSinVer !== null && diasSinVer > DIAS_SIN_VER,
    recurrente: !!o.recurrente,
    diasSinVer,
  };
}

const LICENCIAS: Record<string, string> = { abierto: "datos abiertos", empresa: "publicada por la empresa", socio: "programa de socios", usuaria: "aportada por la usuaria" };

/** Etiqueta de transparencia: solo hechos (antigüedad, veces vista, fuente, licencia y marcas de vigencia). Ningún juicio
 *  sobre la empresa y nada que entre en la nota. */
export function etiquetaTransparencia(o: EntradaVigencia, hoy: string): string[] {
  const v = vigencia(o, hoy);
  const partes: string[] = [];
  const publicada = dia(o.fecha);
  const primera = dia(o.primera_vista);
  if (publicada) partes.push(`publicada hace ${Math.max(0, diasEntre(publicada, hoy))} días`);
  else if (primera) partes.push(`vista por primera vez hace ${Math.max(0, diasEntre(primera, hoy))} días`);
  else partes.push("sin fecha");
  if (typeof o.veces_vista === "number") partes.push(`vista ${o.veces_vista} ${o.veces_vista === 1 ? "vez" : "veces"}`);
  if (o.fuente) partes.push(`fuente: ${o.fuente}`);
  partes.push(`licencia: ${o.licencia ? (LICENCIAS[o.licencia] ?? o.licencia) : "no indicada"}`);
  if (v.cerrada) partes.push(`cerrada el ${dia(o.fecha_cierre)}`);
  if (v.puedeNoEstarVigente) partes.push(`puede no estar vigente: ${v.diasSinVer} días sin verla`);
  if (v.recurrente) partes.push("oferta recurrente: la misma empresa, puesto y municipio aparecen en otras semanas");
  return partes;
}
