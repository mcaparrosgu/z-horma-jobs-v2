// Detector de «instrucciones embebidas» en textos que escribe una empresa (hallazgo B4-4 de la revisión del 7-nov).
// Una oferta es DATO, nunca instrucciones: los agentes ya lo saben, esto es la segunda barrera. Solo código, sin LLM.
// No bloquea nada: rellena auditoria.instrucciones_embebidas y la moderación ve el aviso. Una lista de frases no es
// perfecta (se puede burlar con rodeos, p. ej. «i.g.n.o.r.a»): sube el listón, no sustituye a la moderación humana
// ni a los prompts. Todos los comodines `.{0,N}` están acotados (sin cuantificadores anidados: sin ReDoS).

const PATRONES: RegExp[] = [
  // castellano y catalán (sin tildes: el texto se normaliza antes)
  /\b(ignora|ignorad|olvida|oblida|omite|descarta|salta(te)?)\b.{0,40}\b(instrucciones|instruccions|reglas|regles|indicaciones|indicacions|normas|normes)\b/,
  /\b(ignora|olvida|oblida|omite)\b.{0,25}\b(todo lo anterior|lo anterior|tot l anterior|lo que te (han|hemos) dicho|el texto anterior)\b/,
  /\bno (sigas|obedezcas|cumplas)\b.{0,40}\b(instrucciones|reglas|normas)\b/,
  /\ba partir de ahora\b.{0,40}\b(eres|actua|responde|debes)\b/,
  /\b(actua|comportate) como\b/,
  /\b(eres|seras|ets) (ahora|ara)\b/,
  /\b(envia|manda|aprueba)\b.{0,25}\bcandidatura\b.{0,40}\b(inmediato|inmediatamente|ahora|automatic\w*|sin (revisar|preguntar|confirmar|aprobacion))/,
  /\baprueba (esta|la|mi) candidatura\b/,
  /\b(puntua|puntuacion|nota|califica)\b.{0,40}\b(100|maxima|maximo|perfecta)\b/,
  /\b(muestra|revela|imprime|repite|dime)\b.{0,40}\b(tu|el|tus|las)\b.{0,15}\b(prompt|instrucciones|reglas)\b/,
  /\bprompt del sistema\b|\binstrucciones del sistema\b|\bmensaje del sistema\b/,
  /\bsi (eres|estas leyendo.{0,20}como) (una |un )?(ia|inteligencia artificial|modelo|asistente|agente|bot)\b/,
  /\b(dirigido|destinado) a (la |las |los )?(ia|ias|agentes|asistentes|modelos)\b/,
  // órdenes sobre las herramientas y la salida del flujo
  /\b(marca|marcar) (como )?(enviada|aprobada)\b|\bllama a (la|una) (herramienta|funcion)\b|\bdevuelve (unicamente|solo|solamente) (el siguiente|este)\b|\bresponde (unicamente|solo|solamente) con\b/,
  // inglés
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|your|the)\b.{0,20}\b(instructions|rules|prompts?|guidelines)\b/,
  /\b(ignore|disregard|forget)\b.{0,25}\b(everything|all|the text|the content)\b.{0,15}\b(above|before|prior)\b/,
  /\byou are now\b|\bnew instructions\b|\bsystem prompt\b|\bsystem message\b/,
  /\bif you are (an? )?(ai|llm|language model|assistant|agent|bot)\b/,
  /\b(send|submit)\b.{0,25}\b(application|candidate)\b.{0,40}\b(immediately|now|automatically|without)\b/,
  /\bapprove (this|the|my) (application|candidate)\b/,
  /\b(give|assign|rate)\b.{0,40}\b(score|rating|grade)\b.{0,15}\b(100|10\/10|maximum|highest|perfect)\b/,
  /\b(reveal|print|show|repeat)\b.{0,25}\b(your|the)\b.{0,15}\b(prompt|instructions|rules)\b/,
  // marcas de rol o delimitadores copiados de un prompt (intento de salir del bloque de datos)
  /<\|?\s*(im_start|im_end|system|assistant|\/?oferta|\/?datos|\/?data)\s*\|?>|\[\/?inst\]/,
];
// Solo al principio de una línea (si no, «operating system: Windows» daría falso positivo); se busca con los saltos de línea intactos.
const PATRON_LINEA = /(^|\n)\s*(system|assistant)\s*:/;

const INVISIBLES = /[​-‏‪-‮⁠-⁤﻿­]/g;
// Letras cirílicas y griegas que se parecen a las latinas (para que «іgnora» no escape).
const PARECIDAS: Record<string, string> = { а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ј: "j", ѕ: "s", ο: "o", ρ: "p", ν: "v", α: "a", ι: "i" };

/**
 * Texto normalizado para buscar (minúsculas, sin tildes, anchura completa → normal, letras parecidas → latinas) y, por
 * cada carácter normalizado, su posición en el texto limpio original: así el trozo citado sale con su texto de verdad.
 */
function normalizar(claro: string): { base: string; pos: number[] } {
  let base = "";
  const pos: number[] = [];
  let i = 0;
  for (const ch of claro) {
    const n = ch.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    for (const c of n) { base += PARECIDAS[c] ?? c; pos.push(i); }
    i += ch.length;
  }
  return { base, pos };
}

/** Devuelve los trozos (≤ 120 caracteres, sin repetir, máximo 10) que parecen órdenes a una IA. Vacío si no hay. */
export function detectarInstrucciones(textos: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const t of textos) {
    if (typeof t !== "string" || t === "") continue;
    const claro = t.replace(INVISIBLES, "").replace(/[ \t\f\v\r]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
    const { base, pos } = normalizar(claro);
    const baseEspacios = base.replace(/\n/g, " "); // misma longitud: las posiciones valen para las dos
    for (const [re, texto] of [...PATRONES.map((r) => [r, baseEspacios] as const), [PATRON_LINEA, base] as const]) {
      const m = re.exec(texto);
      if (!m) continue;
      const ini = pos[m.index] ?? 0;
      const fin = (pos[m.index + m[0].length - 1] ?? claro.length - 1) + 1;
      const trozo = claro.slice(Math.max(0, ini - 20), fin + 20).replace(/\s+/g, " ").trim().slice(0, 120);
      if (!out.includes(trozo)) out.push(trozo);
      if (out.length >= 10) return out;
    }
  }
  return out;
}
