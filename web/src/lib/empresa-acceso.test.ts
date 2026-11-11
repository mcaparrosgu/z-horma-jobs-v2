import { test } from "node:test";
import assert from "node:assert/strict";
import { entrarConContrasenaEmpresa, ERROR_ENTRAR_EMPRESA } from "./empresa-acceso.ts";
import { hashContrasena } from "./auth.ts";
import type { Bd } from "./acceso.ts";

type Llamada = { sql: string; params: unknown[] };
function falsa(respuestas: [RegExp, Record<string, unknown>[]][] = []): Bd & { llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    async query(sql: string, params: unknown[] = []) {
      llamadas.push({ sql, params });
      const r = respuestas.find(([re]) => re.test(sql));
      return { rows: r ? r[1] : [], rowCount: r ? r[1].length : 0 };
    },
  };
}
const huboUpdate = (b: { llamadas: Llamada[] }, re: RegExp) => b.llamadas.some((l) => re.test(l.sql));

test("entrar (empresa): correo inexistente y contraseña mala dan el mismo mensaje", async () => {
  const hash = await hashContrasena("la contraseña de la empresa, larga");
  const sinCuenta = await entrarConContrasenaEmpresa(falsa(), "nadie@empresa.invalid", "lo que sea");
  const mala = await entrarConContrasenaEmpresa(
    falsa([[/FROM cuentas_empresa WHERE email/, [{ empresa_id: "e1", hash, fallos: 0, bloqueada_hasta: null }]]]),
    "rrhh@empresa.invalid", "otra frase distinta",
  );
  assert.deepEqual(sinCuenta, { ok: false, error: ERROR_ENTRAR_EMPRESA });
  assert.deepEqual(mala, { ok: false, error: ERROR_ENTRAR_EMPRESA });
});

test("entrar (empresa): contraseña buena deja entrar y pone los fallos a cero", async () => {
  const hash = await hashContrasena("la contraseña de la empresa, larga");
  const bd = falsa([[/FROM cuentas_empresa WHERE email/, [{ empresa_id: "e1", hash, fallos: 2, bloqueada_hasta: null }]]]);
  assert.deepEqual(await entrarConContrasenaEmpresa(bd, " RRHH@empresa.invalid ", "la contraseña de la empresa, larga"), { ok: true, empresa_id: "e1" });
  assert.ok(huboUpdate(bd, /fallos = 0, bloqueada_hasta = NULL/));
});

test("entrar (empresa): una cuenta bloqueada no entra ni con la contraseña correcta", async () => {
  const hash = await hashContrasena("la contraseña de la empresa, larga");
  const futuro = new Date(Date.now() + 10 * 60_000);
  const bd = falsa([[/FROM cuentas_empresa WHERE email/, [{ empresa_id: "e1", hash, fallos: 5, bloqueada_hasta: futuro }]]]);
  assert.deepEqual(await entrarConContrasenaEmpresa(bd, "rrhh@empresa.invalid", "la contraseña de la empresa, larga"), { ok: false, error: ERROR_ENTRAR_EMPRESA });
  assert.ok(!huboUpdate(bd, /fallos = 0/));
});

test("entrar (empresa): una contraseña mala suma un fallo con el mismo límite y bloqueo que las usuarias", async () => {
  const hash = await hashContrasena("la contraseña de la empresa, larga");
  const bd = falsa([[/FROM cuentas_empresa WHERE email/, [{ empresa_id: "e1", hash, fallos: 4, bloqueada_hasta: null }]]]);
  await entrarConContrasenaEmpresa(bd, "rrhh@empresa.invalid", "incorrecta");
  const u = bd.llamadas.find((l) => /fallos = fallos \+ 1/.test(l.sql));
  assert.ok(u);
  assert.deepEqual(u!.params, ["e1", 5, 15]);
});
