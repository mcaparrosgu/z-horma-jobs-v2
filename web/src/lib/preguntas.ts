// Preguntas pendientes de una candidatura (esquema candidatura 0.12, migración 035).
// Las escribe el redactor de la carta (un agente, a partir de una oferta que es texto de terceros): son DATO, nunca orden.
// La web las enseña como texto de React (escapado) y solo las lee; contestar es añadir una respuesta al perfil con el mismo `tema`.
import { detectarInstrucciones } from "./instrucciones-embebidas.ts";
import { MAX_TEMA } from "./respuestas.ts";

export type Pregunta = { tema: string; pregunta: string; esencial: boolean };
export const MAX_PREGUNTAS = 8;
export const MAX_PREGUNTA = 400;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Lo que llega de la base o de un archivo, reducido a una `Pregunta` válida; null si no lo es. */
export function comoPregunta(v: unknown): Pregunta | null {
  if (!v || typeof v !== "object") return null;
  const { tema, pregunta, esencial } = v as Record<string, unknown>;
  if (typeof tema !== "string" || typeof pregunta !== "string" || typeof esencial !== "boolean") return null;
  const t = tema.replace(/\s+/g, " ").trim(), p = pregunta.replace(/\s+/g, " ").trim();
  if (!t || !p || t.length > MAX_TEMA || p.length > MAX_PREGUNTA) return null;
  return { tema: t, pregunta: p, esencial };
}

// Datos que Horma nunca pide (RGPD art. 9) ni credenciales o datos bancarios: si una oferta empuja al redactor a preguntarlos,
// la pregunta no llega a la pantalla. Defensa parcial (sube el listón, no cierra la puerta): la principal es el prompt del redactor.
// Frases concretas, no palabras sueltas, para no descartar «¿has trabajado en el sector salud?» (enfermería, por ejemplo).
const SENSIBLE = new RegExp(
  [
    String.raw`\b(tu|su|de) (estado de )?salud\b`, String.raw`problemas? de salud`, "discapacidad", "embarazo|embarazada", "religi[oó]n|religios[oa]", "creencias",
    "afiliaci[oó]n sindical|sindicad[oa]", "orientaci[oó]n sexual", String.raw`\b(etnia|origen (racial|[eé]tnico)|raza)\b`, String.raw`ideolog[ií]a|opini[oó]n pol[ií]tica|\bvoto\b`,
    "estado civil", String.raw`\b(tienes|tiene|n[uú]mero de) hijos`, "antecedentes penales", String.raw`\bdni\b|\bnie\b|pasaporte`, String.raw`\biban\b|cuenta bancaria|n[uú]mero de cuenta|tarjeta de cr[eé]dito`,
    String.raw`contrase[nñ]a|\bpin\b|seguridad social`,
  ].join("|"), "i");
export const esSensible = (...textos: string[]): boolean => SENSIBLE.test(textos.join(" | ").normalize("NFC"));

/** Preguntas de un archivo al importar: solo las de forma válida y sin órdenes a una IA (defensa parcial, no la única); sin temas repetidos. */
export function preguntasImportables(v: unknown): Pregunta[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  const salida: Pregunta[] = [];
  for (const x of v) {
    const q = comoPregunta(x);
    if (!q || detectarInstrucciones([q.tema, q.pregunta]).length > 0 || esSensible(q.tema, q.pregunta) || vistos.has(norm(q.tema))) continue;
    vistos.add(norm(q.tema));
    salida.push(q);
    if (salida.length >= MAX_PREGUNTAS) break;
  }
  return salida;
}

/** Las que siguen sin contestar: ninguna respuesta del perfil lleva ese tema. Las esenciales van primero. */
export function preguntasSinContestar(preguntas: unknown, respuestas: unknown): Pregunta[] {
  const temas = new Set((Array.isArray(respuestas) ? respuestas : []).map((r) => (r && typeof r === "object" && typeof (r as { tema?: unknown }).tema === "string" ? norm((r as { tema: string }).tema) : "")));
  const vistas = new Set<string>(); // un tema repetido (escritura directa en la base) no debe dar dos formularios iguales
  const lista = (Array.isArray(preguntas) ? preguntas : []).map(comoPregunta).filter((q): q is Pregunta => {
    if (q === null || temas.has(norm(q.tema)) || vistas.has(norm(q.tema))) return false;
    vistas.add(norm(q.tema));
    return true;
  });
  return [...lista.filter((q) => q.esencial), ...lista.filter((q) => !q.esencial)];
}
