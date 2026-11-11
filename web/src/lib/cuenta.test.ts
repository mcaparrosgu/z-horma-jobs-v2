import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiarContrasenaPropia, puedeBorrarCuenta } from "./cuenta.ts";
import { hashContrasena } from "./auth.ts";
import type { Bd } from "./acceso.ts";

type Llamada = { sql: string; params: unknown[] };
function falsa(fila: Record<string, unknown> | undefined): Bd & { llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    async query(sql: string, params: unknown[] = []) {
      llamadas.push({ sql, params });
      if (/SELECT hash, rol, email/.test(sql)) return { rows: fila ? [fila] : [], rowCount: fila ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    },
  };
}
const huboUpdate = (b: { llamadas: Llamada[] }) => b.llamadas.some((l) => /UPDATE cuentas SET hash/.test(l.sql));

test("cambiarContrasenaPropia: sin cuenta, da error y no actualiza", async () => {
  const bd = falsa(undefined);
  assert.deepEqual(await cambiarContrasenaPropia(bd, "u1", "x", "y"), { ok: false, error: "No se encuentra tu cuenta." });
  assert.ok(!huboUpdate(bd));
});

test("cambiarContrasenaPropia: cuenta solo-Google (sin hash) no puede cambiar contraseña", async () => {
  const bd = falsa({ hash: null, rol: "usuaria", email: "ana@x.es" });
  const r = await cambiarContrasenaPropia(bd, "u1", "lo que sea", "una frase larga y rara 2026");
  assert.deepEqual(r, { ok: false, error: "Entras con Google: no tienes contraseña que cambiar." });
  assert.ok(!huboUpdate(bd));
});

test("cambiarContrasenaPropia: contraseña actual mala no cambia nada", async () => {
  const hash = await hashContrasena("la contraseña actual, bien larga");
  const bd = falsa({ hash, rol: "usuaria", email: "ana@x.es" });
  const r = await cambiarContrasenaPropia(bd, "u1", "una actual incorrecta", "una frase larga y rara 2026");
  assert.deepEqual(r, { ok: false, error: "La contraseña actual no es correcta." });
  assert.ok(!huboUpdate(bd));
});

test("cambiarContrasenaPropia: nueva contraseña demasiado corta se rechaza con problemaContrasena", async () => {
  const hash = await hashContrasena("la contraseña actual, bien larga");
  const bd = falsa({ hash, rol: "usuaria", email: "ana@x.es" });
  const r = await cambiarContrasenaPropia(bd, "u1", "la contraseña actual, bien larga", "corta");
  assert.equal(r.ok, false);
  assert.ok(!huboUpdate(bd));
});

test("cambiarContrasenaPropia: con la actual buena y la nueva válida, actualiza y pone los fallos a cero", async () => {
  const hash = await hashContrasena("la contraseña actual, bien larga");
  const bd = falsa({ hash, rol: "usuaria", email: "ana@x.es" });
  const r = await cambiarContrasenaPropia(bd, "u1", "la contraseña actual, bien larga", "una frase larga y rara 2026 nueva");
  assert.deepEqual(r, { ok: true });
  const u = bd.llamadas.find((l) => /UPDATE cuentas SET hash/.test(l.sql));
  assert.ok(u);
  assert.equal(u!.params[0], "u1");
  assert.ok(typeof u!.params[1] === "string" && (u!.params[1] as string).startsWith("scrypt$"));
});

test("puedeBorrarCuenta: la cuenta de administración nunca se puede borrar, ni con la contraseña correcta", async () => {
  const hash = await hashContrasena("la contraseña del admin, larga");
  const bd = falsa({ hash, rol: "admin", email: "admin@x.es" });
  const r = await puedeBorrarCuenta(bd, "u1", "la contraseña del admin, larga");
  assert.deepEqual(r, { ok: false, error: "La cuenta de administración no se borra desde la web." });
});

test("puedeBorrarCuenta: con contraseña, hace falta escribirla bien", async () => {
  const hash = await hashContrasena("la contraseña de ana, larga y rara");
  const bd = falsa({ hash, rol: "usuaria", email: "ana@x.es" });
  assert.deepEqual(await puedeBorrarCuenta(bd, "u1", "mala"), { ok: false, error: "La contraseña no es correcta." });
  assert.deepEqual(await puedeBorrarCuenta(bd, "u1", "la contraseña de ana, larga y rara"), { ok: true });
});

test("puedeBorrarCuenta: cuenta solo-Google, hace falta escribir el correo exacto (sin mayúsculas ni espacios)", async () => {
  const bd = falsa({ hash: null, rol: "usuaria", email: "ana@x.es" });
  assert.deepEqual(await puedeBorrarCuenta(bd, "u1", "otro@x.es"), { ok: false, error: "Escribe tu correo exactamente para confirmar." });
  assert.deepEqual(await puedeBorrarCuenta(bd, "u1", "  ANA@x.es  "), { ok: true });
});

test("puedeBorrarCuenta: sin cuenta, da error", async () => {
  assert.deepEqual(await puedeBorrarCuenta(falsa(undefined), "u1", "lo que sea"), { ok: false, error: "No se encuentra tu cuenta." });
});

test("cambiarContrasenaPropia: una contraseña actual mala suma un fallo (mismo contador que el login)", async () => {
  const hash = await hashContrasena("la contraseña actual, bien larga");
  const bd = falsa({ hash, rol: "usuaria", email: "ana@x.es" });
  await cambiarContrasenaPropia(bd, "u1", "incorrecta", "una frase larga y rara 2026");
  assert.ok(bd.llamadas.some((l) => /SET fallos = fallos \+ 1/.test(l.sql)));
});

test("cuenta bloqueada: ni cambiar contraseña ni borrar prueban la contraseña, aunque sea la buena", async () => {
  const hash = await hashContrasena("la contraseña actual, bien larga");
  const fila = { hash, rol: "usuaria", email: "ana@x.es", fallos: 5, bloqueada_hasta: new Date(Date.now() + 600_000) };
  const bd = falsa(fila);
  const a = await cambiarContrasenaPropia(bd, "u1", "la contraseña actual, bien larga", "una frase larga y rara 2026 nueva");
  const b = await puedeBorrarCuenta(bd, "u1", "la contraseña actual, bien larga");
  assert.deepEqual(a, { ok: false, error: "Demasiados intentos: espera unos minutos." });
  assert.deepEqual(b, { ok: false, error: "Demasiados intentos: espera unos minutos." });
  assert.ok(!huboUpdate(bd));
});
