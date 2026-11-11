// Validador único de Horma: lee los MISMOS esquemas JSON que usan los agentes
// (.claude/skills/esquemas-horma/schemas/), para que haya un solo contrato.
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ESQUEMAS = [
  "oferta", "perfil", "preferencias", "match", "candidatura",
  "calificacion-fuente", "endpoints", "clasificacion-respuesta",
] as const;
export type NombreEsquema = (typeof ESQUEMAS)[number];

export type Resultado<T = unknown> =
  | { ok: true; dato: T }
  | { ok: false; errores: string[] };

// Carpeta de los esquemas: se puede cambiar con HORMA_ESQUEMAS_DIR (p. ej. dentro de Docker).
const DIR =
  process.env.HORMA_ESQUEMAS_DIR ??
  join(process.cwd(), "..", ".claude", "skills", "esquemas-horma", "schemas");

// strictRequired desactivado: endpoints.json exige claves que define con additionalProperties (válido en JSON Schema).
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const compilados = new Map<NombreEsquema, ValidateFunction>();

function validador(nombre: NombreEsquema): ValidateFunction {
  let v = compilados.get(nombre);
  if (!v) {
    if (!ESQUEMAS.includes(nombre)) throw new Error(`Esquema desconocido: ${nombre}`);
    v = ajv.compile(JSON.parse(readFileSync(join(DIR, `${nombre}.json`), "utf8")));
    compilados.set(nombre, v);
  }
  return v;
}

/** Comprueba un dato contra un esquema. Nunca lanza por datos malos: devuelve los errores. */
export function validar<T = unknown>(nombre: NombreEsquema, dato: unknown): Resultado<T> {
  const v = validador(nombre);
  if (v(dato)) return { ok: true, dato: dato as T };
  return {
    ok: false,
    errores: (v.errors ?? []).map((e) => `${e.instancePath || "(raíz)"} ${e.message}`),
  };
}
