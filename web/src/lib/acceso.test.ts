import { test } from "node:test";
import assert from "node:assert/strict";
import { entrarConContrasena, registrarCuenta, entrarConGoogle, ERROR_ENTRAR, type Bd } from "./acceso.ts";
import { hashContrasena } from "./auth.ts";

type Llamada = { sql: string; params: unknown[] };

/** Base falsa: guarda cada consulta y responde con lo que se le pida según el texto del SQL. */
function falsa(respuestas: [RegExp, Record<string, unknown>[]][] = [], fallar?: RegExp): Bd & { llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    async query(sql: string, params: unknown[] = []) {
      llamadas.push({ sql, params });
      if (fallar && fallar.test(sql)) throw new Error("fallo simulado");
      const r = respuestas.find(([re]) => re.test(sql));
      return { rows: r ? r[1] : [], rowCount: r ? r[1].length : 0 };
    },
  };
}
const huboUpdate = (b: { llamadas: Llamada[] }, re: RegExp) => b.llamadas.some((l) => re.test(l.sql));

test("entrar: un correo inexistente y una contraseña mala dan EL MISMO mensaje", async () => {
  const hash = await hashContrasena("una frase larga y rara 2026");
  const sinCuenta = await entrarConContrasena(falsa(), "nadie@x.es", "una frase larga y rara 2026");
  const mala = await entrarConContrasena(
    falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", hash, fallos: 0, bloqueada_hasta: null }]]]), "ana@x.es", "otra frase distinta de la buena");
  assert.deepEqual(sinCuenta, { ok: false, error: ERROR_ENTRAR });
  assert.deepEqual(mala, { ok: false, error: ERROR_ENTRAR });
});

test("entrar: contraseña buena deja entrar y pone a cero los fallos", async () => {
  const hash = await hashContrasena("una frase larga y rara 2026");
  const bd = falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", hash, fallos: 3, bloqueada_hasta: null }]]]);
  assert.deepEqual(await entrarConContrasena(bd, " ANA@x.es ", "una frase larga y rara 2026"), { ok: true, usuaria_id: "u1" });
  assert.ok(huboUpdate(bd, /fallos = 0, bloqueada_hasta = NULL/));
});

test("entrar: una contraseña mala suma un fallo y el límite bloquea", async () => {
  const hash = await hashContrasena("una frase larga y rara 2026");
  const bd = falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", hash, fallos: 4, bloqueada_hasta: null }]]]);
  await entrarConContrasena(bd, "ana@x.es", "incorrecta incorrecta");
  const u = bd.llamadas.find((l) => /fallos = fallos \+ 1/.test(l.sql));
  assert.ok(u, "suma un fallo");
  assert.deepEqual(u!.params, ["u1", 5, 15]); // límite 5, bloqueo 15 minutos
});

test("entrar: una cuenta bloqueada no entra ni con la contraseña buena", async () => {
  const hash = await hashContrasena("una frase larga y rara 2026");
  const futuro = new Date(Date.now() + 10 * 60_000);
  const bd = falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", hash, fallos: 5, bloqueada_hasta: futuro }]]]);
  assert.deepEqual(await entrarConContrasena(bd, "ana@x.es", "una frase larga y rara 2026"), { ok: false, error: ERROR_ENTRAR });
  assert.ok(!huboUpdate(bd, /fallos = 0/), "no se pone a cero un bloqueo");
});

test("entrar: una cuenta solo de Google (sin contraseña) no entra por aquí, y los datos raros no rompen nada", async () => {
  const bd = falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", hash: null, fallos: 0, bloqueada_hasta: null }]]]);
  assert.deepEqual(await entrarConContrasena(bd, "ana@x.es", "lo que sea"), { ok: false, error: ERROR_ENTRAR });
  for (const raro of [[undefined, undefined], [null, 5], [{}, []], ["no-correo", "x".repeat(10_000)]]) {
    assert.deepEqual(await entrarConContrasena(falsa(), raro[0], raro[1]), { ok: false, error: ERROR_ENTRAR });
  }
});

test("registrar: valida antes de tocar la base y guarda solo el hash", async () => {
  const bd = falsa();
  assert.equal((await registrarCuenta(bd, "no-correo", "una frase larga y rara 2026")).ok, false);
  assert.equal((await registrarCuenta(bd, "ana@x.es", "corta")).ok, false);
  assert.equal(bd.llamadas.length, 0, "con datos no válidos no se llega a la base");

  const r = await registrarCuenta(bd, "Ana@X.es", "una frase larga y rara 2026");
  assert.ok(r.ok && /^u[0-9a-f]{16}$/.test(r.usuaria_id));
  const ins = bd.llamadas.find((l) => /INSERT INTO cuentas/.test(l.sql))!;
  assert.equal(ins.params[1], "ana@x.es");
  assert.match(String(ins.params[2]), /^scrypt\$/);
  assert.ok(!JSON.stringify(bd.llamadas).includes("una frase larga y rara"), "la contraseña no llega a la base");
  assert.ok(!/email_verificado|rol/.test(ins.sql), "la web no fija ni el rol ni la verificación");
  assert.deepEqual(bd.llamadas.map((l) => l.sql.split(" ")[0]), ["BEGIN", "INSERT", "INSERT", "COMMIT"]);
});

test("registrar: si la base falla (por ejemplo, correo repetido) deshace todo y no dice el motivo", async () => {
  const bd = falsa([], /INSERT INTO cuentas/);
  const r = await registrarCuenta(bd, "ana@x.es", "una frase larga y rara 2026");
  assert.equal(r.ok, false);
  assert.ok(bd.llamadas.some((l) => l.sql === "ROLLBACK"));
  assert.ok(!JSON.stringify(r).includes("fallo simulado"));
});

test("Google: una cuenta ya unida a ese sub entra directamente", async () => {
  const bd = falsa([[/google_sub = \$1/, [{ usuaria_id: "u9" }]]]);
  assert.deepEqual(await entrarConGoogle(bd, "sub-1", "ana@x.es"), { ok: true, usuaria_id: "u9" });
});

test("Google: se une a una cuenta con el mismo correo ya verificada, sin tocar su contraseña", async () => {
  const bd = falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", email_verificado: true, google_sub: null, rol: "usuaria" }]]]);
  assert.deepEqual(await entrarConGoogle(bd, "sub-1", "Ana@X.es"), { ok: true, usuaria_id: "u1" });
  assert.ok(huboUpdate(bd, /SET google_sub = \$2 WHERE/));
  assert.ok(!huboUpdate(bd, /hash = NULL/));
});

test("Google: una cuenta de contraseña SIN verificar pasa a Google, pierde la contraseña y se cierran sus sesiones (suplantación)", async () => {
  const bd = falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", email_verificado: false, google_sub: null, rol: "usuaria" }]]]);
  assert.deepEqual(await entrarConGoogle(bd, "sub-1", "ana@x.es"), { ok: true, usuaria_id: "u1" });
  assert.ok(huboUpdate(bd, /hash = NULL/));
  assert.ok(huboUpdate(bd, /DELETE FROM sesiones/));
});

test("Google: nunca se une solo a una cuenta de administración ni a una ya unida a otro Google", async () => {
  const admin = falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", email_verificado: true, google_sub: null, rol: "admin" }]]]);
  assert.equal((await entrarConGoogle(admin, "sub-1", "ana@x.es")).ok, false);
  assert.ok(!huboUpdate(admin, /SET google_sub/));
  const otro = falsa([[/FROM cuentas WHERE email/, [{ usuaria_id: "u1", email_verificado: true, google_sub: "otro", rol: "usuaria" }]]]);
  assert.equal((await entrarConGoogle(otro, "sub-1", "ana@x.es")).ok, false);
});

test("Google: un correo nuevo crea usuaria y cuenta verificada, sin contraseña, en una transacción", async () => {
  const bd = falsa();
  const r = await entrarConGoogle(bd, "sub-1", "nueva@x.es");
  assert.ok(r.ok);
  const ins = bd.llamadas.find((l) => /INSERT INTO cuentas/.test(l.sql))!;
  assert.deepEqual(ins.params.slice(1), ["nueva@x.es", "sub-1"]);
  assert.match(ins.sql, /true\)/); // email_verificado
  assert.deepEqual(bd.llamadas.map((l) => l.sql.split(" ")[0]).filter((x) => ["BEGIN", "COMMIT", "ROLLBACK"].includes(x)), ["BEGIN", "COMMIT"]);
  assert.equal((await entrarConGoogle(falsa(), "sub", "no-correo")).ok, false);
});
