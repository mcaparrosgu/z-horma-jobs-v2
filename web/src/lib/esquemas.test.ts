// Pruebas del validador. Se ejecutan con: npm test  (usa el ejecutor de pruebas de Node, sin dependencias)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validar, ESQUEMAS } from "./esquemas.ts";
import { SQL_MATCHES } from "./matches.ts";

const FIX = join(process.cwd(), "..", "datos", "fixtures");
const leer = (...ruta: string[]) => JSON.parse(readFileSync(join(FIX, ...ruta), "utf8"));

test("los 8 esquemas compilan", () => {
  for (const e of ESQUEMAS) validar(e, {});
});

test("las ofertas de ejemplo son válidas", () => {
  for (const f of ["of-prueba-1.json", "of-prueba-2.json"]) {
    const r = validar("oferta", leer("ofertas", f));
    assert.ok(r.ok, f + ": " + (r.ok ? "" : r.errores.join("; ")));
  }
});

test("perfiles y preferencias de ejemplo son válidos", () => {
  for (const p of ["ana-datos", "leo-diseno"]) {
    for (const [esq, arch] of [["perfil", "perfil.json"], ["preferencias", "preferencias.json"]] as const) {
      const r = validar(esq, leer("perfiles", p, arch));
      assert.ok(r.ok, `${p}/${arch}: ` + (r.ok ? "" : r.errores.join("; ")));
    }
  }
});

test("rechaza un campo que no existe en el esquema (additionalProperties)", () => {
  const r = validar("oferta", { ...leer("ofertas", "of-prueba-1.json"), edad_minima: 30 });
  assert.equal(r.ok, false);
});

test("rechaza un valor fuera de la lista (remoto)", () => {
  const r = validar("oferta", { ...leer("ofertas", "of-prueba-1.json"), remoto: "a_ratos" });
  assert.equal(r.ok, false);
});

test("rechaza un id con caracteres peligrosos", () => {
  const r = validar("oferta", { ...leer("ofertas", "of-prueba-1.json"), id: "../../etc" });
  assert.equal(r.ok, false);
});

test("rechaza un rango de compatibilidad fuera de 0-100", () => {
  const p = leer("perfiles", "ana-datos", "preferencias.json");
  assert.equal(validar("preferencias", { ...p, rango_compatibilidad: [10, 150] }).ok, false);
});

test("un dato vacío devuelve errores, no lanza excepción", () => {
  const r = validar("perfil", {});
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errores.length > 0);
});

test("un esquema desconocido lanza error", () => {
  assert.throws(() => validar("inventado" as never, {}));
});

test("oferta.avisos es opcional, solo admite tipos conocidos y no admite claves extra", () => {
  const o = leer("ofertas", "of-prueba-1.json");
  assert.ok(validar("oferta", o).ok);
  const ok = { ...o, avisos: [{ tipo: "ciudadania", texto: "x" }, { tipo: "habilitacion_seguridad", texto: "y" }] };
  assert.ok(validar("oferta", ok).ok);
  assert.ok(!validar("oferta", { ...o, avisos: [{ tipo: "nacionalidad", texto: "x" }] }).ok);
  assert.ok(!validar("oferta", { ...o, avisos: [{ tipo: "otro", texto: "x", puntos: 3 }] }).ok);
  assert.ok(!validar("oferta", { ...o, avisos: [{ tipo: "otro" }] }).ok);
});

test("línea roja: el filtro y la nota de las ofertas no leen los avisos (ciudadanía, permisos)", () => {
  const raiz = join(process.cwd(), "..", ".claude");
  for (const f of [join("skills", "buscar-ofertas", "scripts", "buscar.py")]) {
    assert.ok(!readFileSync(join(raiz, f), "utf8").includes("avisos"), f + " no debe usar `avisos`");
  }
  const matcher = readFileSync(join(raiz, "agents", "matcher.md"), "utf8");
  assert.match(matcher, /Ignora `avisos`/); // el matcher tiene la orden explícita de ignorarlos
});

test("los errores del validador nunca repiten el valor que falló (pueden ser datos personales)", () => {
  const SECRETO = "SECRETO-Ana-Garcia-600123456";
  const malos = [
    { ...leer("ofertas", "of-prueba-1.json"), titulo: 12345, nivel: SECRETO, remoto: SECRETO, fecha: SECRETO, url: SECRETO },
    { ...leer("ofertas", "of-prueba-1.json"), requisitos: [SECRETO, 7], avisos: [SECRETO], extra: SECRETO },
    { id: SECRETO },
  ];
  for (const dato of malos) {
    const r = validar("oferta", dato);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.errores.length > 0);
      assert.ok(!r.errores.join("\n").includes(SECRETO), r.errores.join("; "));
    }
  }
});

test("ninguno de los 8 esquemas repite en sus errores el valor ni el nombre de campo que falló", () => {
  const SECRETO = "SECRETO-Ana-Garcia-600123456";
  /** Sustituye cada texto y número por el secreto, en cualquier profundidad (los booleanos y null se dejan). */
  const envenenar = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(envenenar)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, envenenar(x)]))
    : typeof v === "string" || typeof v === "number" ? SECRETO : v;
  const base: Record<string, unknown> = {
    oferta: leer("ofertas", "of-prueba-1.json"),
    perfil: leer("perfiles", "ana-datos", "perfil.json"),
    preferencias: leer("perfiles", "ana-datos", "preferencias.json"),
  };
  const dir = process.env.HORMA_ESQUEMAS_DIR ?? join(process.cwd(), "..", ".claude", "skills", "esquemas-horma", "schemas");
  for (const nombre of ESQUEMAS) {
    const propiedades = Object.keys(JSON.parse(readFileSync(join(dir, `${nombre}.json`), "utf8")).properties ?? {});
    const casos = [
      envenenar(base[nombre] ?? {}),
      Object.fromEntries(propiedades.map((k) => [k, SECRETO])),
      { [SECRETO]: SECRETO, ...(base[nombre] as object | undefined) }, // clave de más con el secreto como nombre
    ];
    for (const dato of casos) {
      const r = validar(nombre, dato);
      assert.equal(r.ok, false, `${nombre}: el dato envenenado no debería ser válido`);
      if (!r.ok) assert.ok(!r.errores.join(" | ").includes(SECRETO), `${nombre}: ${r.errores.join("; ").slice(0, 300)}`);
    }
  }
});

test("esquema 0.5: usuaria_id en perfil y match solo admite minúsculas", () => {
  const perfil = leer("perfiles", "ana-datos", "perfil.json");
  assert.equal(validar("perfil", perfil).ok, true);
  for (const mal of ["Ana-datos", "ANA", "ana datos", "../ana"]) {
    assert.equal(validar("perfil", { ...perfil, usuaria_id: mal }).ok, false, mal);
  }
  const base = { version_perfil: "v1", fecha: "2026-11-06", ofertas: [] };
  assert.equal(validar("match", { ...base, usuaria_id: "ana-datos" }).ok, true);
  assert.equal(validar("match", { ...base, usuaria_id: "Ana-datos" }).ok, false);
});

test("esquema 0.7: match admite nota null y rechaza fechas, versiones y textos fuera de rango", () => {
  const of = { oferta_id: "of-1", nota: 40, nivel_condiciones: "parcial", explicacion: "x" };
  const m = (o: object, extra: object = {}) => ({ usuaria_id: "ana-datos", version_perfil: "v1", fecha: "2026-11-06", ofertas: [{ ...of, ...o }], ...extra });
  assert.equal(validar("match", m({})).ok, true);
  assert.equal(validar("match", m({ nota: null })).ok, true, "sin nota es válido");
  assert.equal(validar("match", m({ nota: 101 })).ok, false);
  assert.equal(validar("match", m({ nota: "70" })).ok, false);
  assert.equal(validar("match", m({ explicacion: "" })).ok, false);
  assert.equal(validar("match", m({ explicacion: "x".repeat(1501) })).ok, false);
  assert.equal(validar("match", m({ correccion: "x".repeat(1501) })).ok, false);
  assert.equal(validar("match", m({}, { fecha: "6-11-2026" })).ok, false);
  assert.equal(validar("match", m({}, { fecha: "2026-13-45" })).ok, false);
  assert.equal(validar("match", m({ oferta_id: "o".repeat(201) })).ok, false);
  assert.equal(validar("match", m({}, { version_perfil: "v".repeat(81) })).ok, false);
});

test("página de recomendaciones: la nota nula se ordena al final y se rotula «sin nota»", () => {
  assert.match(SQL_MATCHES, /ORDER BY m\.nota DESC NULLS LAST/);
});
