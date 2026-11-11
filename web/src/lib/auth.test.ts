import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  normalizarEmail, problemaContrasena, hashContrasena, verificarContrasena, HASH_SENUELO, estaBloqueada,
  nuevoIdUsuaria, nuevoToken, huella, esDuena, desafioPkce, urlGoogle, iguales, leerIdToken, validarClaimsGoogle,
  UUID, type Sesion,
} from "./auth.ts";
import { rutaPublica } from "./rutas.ts";

test("normalizarEmail: minúsculas, sin espacios, y rechaza lo que no es un correo", () => {
  assert.equal(normalizarEmail("  Ana@Ejemplo.ES "), "ana@ejemplo.es");
  for (const malo of ["", "ana", "ana@", "@x.es", "a b@x.es", "ana@x", 5, null, undefined, "a@b.c".repeat(100)]) assert.equal(normalizarEmail(malo), null);
});

test("problemaContrasena: largo mínimo y máximo, sin el propio correo ni un solo carácter repetido", () => {
  assert.match(problemaContrasena("corta", null)!, /al menos 12/);
  assert.match(problemaContrasena("x".repeat(129), null)!, /128/);
  assert.match(problemaContrasena("aaaaaaaaaaaaaa", null)!, /repetido/);
  assert.match(problemaContrasena("lleva-ana.garcia-dentro", "ana.garcia@ejemplo.es")!, /correo/);
  assert.equal(problemaContrasena("una frase larga y rara 2026", "ana@ejemplo.es"), null);
  assert.match(problemaContrasena(undefined, null)!, /contraseña/i);
});

test("hash de contraseña: distinto cada vez, verifica la buena y rechaza la mala", async () => {
  const a = await hashContrasena("una frase larga y rara 2026");
  const b = await hashContrasena("una frase larga y rara 2026");
  assert.notEqual(a, b); // sal aleatoria
  assert.match(a, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verificarContrasena("una frase larga y rara 2026", a), true);
  assert.equal(await verificarContrasena("otra frase larga y rara 2026", a), false);
  assert.ok(!a.includes("una frase"), "el hash no contiene la contraseña");
});

test("verificarContrasena nunca lanza y no acepta hashes mal formados ni parámetros desmedidos", async () => {
  assert.equal(await verificarContrasena("x", "no-es-un-hash"), false);
  assert.equal(await verificarContrasena("x", "scrypt$1$1$1$AA$AA"), false); // N demasiado bajo
  assert.equal(await verificarContrasena("x", "scrypt$1073741824$8$1$AAAA$AAAA"), false); // N desmedido: no agota la memoria
  assert.equal(await verificarContrasena("x".repeat(500), HASH_SENUELO), false);
  assert.equal(await verificarContrasena("x", HASH_SENUELO), false); // el señuelo existe y no deja pasar a nadie
});

test("bloqueo: solo mientras no ha pasado la hora", () => {
  const ahora = new Date("2026-11-06T12:00:00Z");
  assert.equal(estaBloqueada(null, ahora), false);
  assert.equal(estaBloqueada(new Date("2026-11-06T12:10:00Z"), ahora), true);
  assert.equal(estaBloqueada(new Date("2026-11-06T11:59:00Z"), ahora), false);
});

test("ids y tokens: el id interno cumple la regla de ids, el token es largo y la huella no es el token", () => {
  assert.match(nuevoIdUsuaria(), /^u[0-9a-f]{16}$/);
  assert.notEqual(nuevoIdUsuaria(), nuevoIdUsuaria());
  const t = nuevoToken();
  assert.ok(t.length >= 43);
  assert.equal(huella(t), createHash("sha256").update(t).digest("hex"));
  assert.match(huella(t), /^[0-9a-f]{64}$/);
  assert.notEqual(huella(t), t);
});

const sesion = (publico: string, rol: "usuaria" | "admin" = "usuaria"): Sesion => ({ usuaria_id: "u1", publico, rol, email: "a@b.es", google: false });
const P1 = "123e4567-e89b-42d3-a456-426614174000", P2 = "223e4567-e89b-42d3-a456-426614174000";

test("esDuena: solo su dueña; ni la administradora ni nadie sin sesión; un id mal formado no pasa", () => {
  assert.equal(esDuena(sesion(P1), P1), true);
  assert.equal(esDuena(sesion(P1), P2), false);
  assert.equal(esDuena(sesion(P1, "admin"), P2), false, "la administración no ve los datos personales de otra");
  assert.equal(esDuena(null, P1), false);
  assert.equal(esDuena(sesion("mar"), "mar"), false, "un id legible no es un id público");
  assert.ok(UUID.test(P1) && !UUID.test("mar"));
});

test("rutaPublica: solo entrar y el flujo de Google", () => {
  for (const r of ["/entrar", "/auth/google", "/auth/google/callback"]) assert.equal(rutaPublica(r), true);
  for (const r of ["/", "/ofertas", "/salud", "/candidatos/" + P1, "/entrar/otra", "/auth/google/../x", "/auth"]) assert.equal(rutaPublica(r), false);
});

test("PKCE y la URL de Google llevan state, nonce y desafío S256; sin el secreto del cliente", () => {
  const d = desafioPkce("verificador");
  assert.equal(d, createHash("sha256").update("verificador").digest("base64url"));
  const u = new URL(urlGoogle({ clientId: "cid", redirectUri: "http://localhost:3000/auth/google/callback", estado: "E", desafio: d, nonce: "N" }));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("state"), "E");
  assert.equal(u.searchParams.get("nonce"), "N");
  assert.equal(u.searchParams.get("code_challenge"), d);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("scope"), "openid email");
  assert.ok(!u.search.includes("secret"));
});

test("iguales compara en tiempo constante y no acepta vacíos ni longitudes distintas", () => {
  assert.equal(iguales("abc", "abc"), true);
  assert.equal(iguales("abc", "abd"), false);
  assert.equal(iguales("abc", "abcd"), false);
  assert.equal(iguales("", ""), false);
});

const token = (c: object) => `x.${Buffer.from(JSON.stringify(c)).toString("base64url")}.y`;
const bueno = { iss: "https://accounts.google.com", aud: "cid", exp: 2000, nonce: "N", sub: "123", email: "Ana@Ejemplo.es", email_verified: true };
const esp = { clientId: "cid", nonce: "N", ahoraSeg: 1000 };

test("id_token de Google: acepta el correcto y rechaza cada fallo", () => {
  assert.deepEqual(validarClaimsGoogle(leerIdToken(token(bueno)), esp), { ok: true, sub: "123", email: "ana@ejemplo.es" });
  const casos: [string, object][] = [
    ["emisor", { ...bueno, iss: "https://evil.example" }], ["destinatario", { ...bueno, aud: "otro" }],
    ["caducado", { ...bueno, exp: 999 }], ["nonce", { ...bueno, nonce: "otro" }],
    ["sin identificador", { ...bueno, sub: "" }], ["correo sin verificar", { ...bueno, email_verified: false }],
    ["correo sin verificar", { ...bueno, email_verified: "true" }], ["sin correo", { ...bueno, email: "no-es-correo" }],
  ];
  for (const [motivo, c] of casos) assert.deepEqual(validarClaimsGoogle(leerIdToken(token(c)), esp), { ok: false, motivo });
  assert.equal(validarClaimsGoogle(null, esp).ok, false);
  assert.equal(leerIdToken("sin-puntos"), null);
  assert.equal(leerIdToken(`a.${Buffer.from("[1]").toString("base64url")}.c`), null);
  assert.equal(leerIdToken(123), null);
});
