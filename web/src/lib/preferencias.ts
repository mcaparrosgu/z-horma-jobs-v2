// Validación de las preferencias que la usuaria edita en la web, y consultas de candidatos.
// Reglas: nada se guarda sin pasar por validar("preferencias"); sin edad, nacionalidad ni categorías
// especiales (RGPD art. 9): el esquema prohíbe cualquier campo extra, así que ni se pueden enviar.
import { validar } from "./esquemas.ts";

// Solo minúsculas, igual que el CHECK de la migración 010 (en Windows «Ana» y «ana» serían la misma carpeta).
export const ID_USUARIA = /^[a-z0-9_-][a-z0-9_.-]{0,79}$/;
export const REMOTOS_PREF = ["presencial", "hibrido", "remoto"] as const;
export const HORARIOS_PREF = ["manana", "tarde", "noche", "flexible"] as const;

export type Preferencias = {
  puestos: string[]; ciudades: string[]; paises: string[]; remoto: string[]; contrato: string[];
  idiomas: string[]; sectores: string[]; niveles: string[]; horario: string[]; sueldo_min: number | null;
  rango_compatibilidad: [number, number];
};

/** «a, b ,c» → ["a","b","c"]. Máximo 20 elementos de 80 caracteres; sin duplicados. */
export function listaDeTexto(texto: unknown): string[] {
  if (typeof texto !== "string") return [];
  const vistos = new Set<string>();
  for (const t of texto.split(",")) {
    const v = t.trim().slice(0, 80);
    if (v) vistos.add(v);
  }
  return [...vistos].slice(0, 20);
}

export type EntradaPreferencias = {
  puestos?: string; ciudades?: string; paises?: string; contrato?: string; idiomas?: string; sectores?: string; niveles?: string;
  remoto?: string[]; horario?: string[]; sueldo_min?: string; rango_min?: string; rango_max?: string;
};

export type ResultadoPreferencias = { ok: true; prefs: Preferencias } | { ok: false; errores: string[] };

const numero = (s: string | undefined): number | null | "mal" => {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : "mal";
};

export function validarPreferencias(e: EntradaPreferencias): ResultadoPreferencias {
  const errores: string[] = [];
  const sueldo = numero(e.sueldo_min);
  if (sueldo === "mal" || (typeof sueldo === "number" && (sueldo < 0 || sueldo > 10_000_000))) errores.push("sueldo mínimo: número entre 0 y 10.000.000, o vacío");
  const min = numero(e.rango_min);
  const max = numero(e.rango_max);
  if (typeof min !== "number" || typeof max !== "number" || !Number.isInteger(min) || !Number.isInteger(max)) {
    errores.push("rango de compatibilidad: dos números enteros");
  } else if (min < 0 || max > 100 || min > max) {
    errores.push("rango de compatibilidad: entre 0 y 100, con el mínimo menor o igual que el máximo");
  }
  const paises = listaDeTexto(e.paises).map((p) => p.toUpperCase());
  if (paises.some((p) => !/^[A-Z]{2}$/.test(p))) errores.push("países: códigos de 2 letras (ES, FR…)");
  const remoto = (e.remoto ?? []).filter((r) => (REMOTOS_PREF as readonly string[]).includes(r));
  const horario = (e.horario ?? []).filter((h) => (HORARIOS_PREF as readonly string[]).includes(h));
  if (errores.length) return { ok: false, errores };

  const prefs: Preferencias = {
    puestos: listaDeTexto(e.puestos), ciudades: listaDeTexto(e.ciudades), paises,
    remoto: [...new Set(remoto)], horario: [...new Set(horario)], contrato: listaDeTexto(e.contrato), idiomas: listaDeTexto(e.idiomas),
    sectores: listaDeTexto(e.sectores), niveles: listaDeTexto(e.niveles),
    sueldo_min: typeof sueldo === "number" ? sueldo : null,
    rango_compatibilidad: [min as number, max as number],
  };
  const r = validar("preferencias", prefs);
  return r.ok ? { ok: true, prefs } : { ok: false, errores: r.errores };
}

// --- Consultas (siempre por una usuaria concreta; no existe ninguna consulta «para empresas») ---
// Lista para administración ($1 = la administradora): sin ids ni correos, solo si tiene perfil y cuál es la propia.
export const SQL_USUARIAS = `
  SELECT u.publico::text AS publico, (u.id = $1) AS soy_yo, (p.usuaria_id IS NOT NULL) AS tiene_perfil
  FROM usuarias u LEFT JOIN usuarias_con_perfil() p ON p.usuaria_id = u.id ORDER BY u.id`; // A3: perfiles tiene RLS; la función solo dice quién tiene perfil
export const SQL_PERFIL = `
  SELECT experiencias, formacion, skills, idiomas, taxonomia, preguntas_pendientes, cv_texto, respuestas
  FROM perfiles WHERE usuaria_id = $1`;
export const SQL_PREFERENCIAS = `
  SELECT puestos, ciudades, paises, remoto, contrato, idiomas, sectores, niveles, horario, sueldo_min, rango_compatibilidad
  FROM preferencias WHERE usuaria_id = $1`;
