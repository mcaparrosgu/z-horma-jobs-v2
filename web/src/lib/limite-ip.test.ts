import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoConfigIp, agruparIpv6, ipDelCliente, claveIp, ipBloqueada, anotarFalloIp, MAX_FALLOS_IP, SQL_ANOTAR_FALLO } from "./limite-ip.ts";

test("la IP solo se toma con proxy de confianza, y es la última de la cadena (la del proxy, no la que escribe el cliente)", () => {
  const SAL = "sal-de-prueba-0123456789";
  assert.equal(ipDelCliente("1.2.3.4", false, SAL), null);
  assert.equal(ipDelCliente("9.9.9.9, 1.2.3.4", true, SAL), "1.2.3.4");
  assert.equal(ipDelCliente("1.2.3.4, no-es-ip", true, SAL), null);
  assert.equal(ipDelCliente(null, true, SAL), null);
  assert.equal(ipDelCliente("2001:db8::1", true, SAL), "2001:db8:0:0::/64");
  // Sin sal secreta (o demasiado corta) no se usa la IP: un hash sin sal se revierte por fuerza bruta.
  assert.equal(ipDelCliente("1.2.3.4", true, ""), null);
  assert.equal(ipDelCliente("1.2.3.4", true, "corta"), null);
});

test("una IPv6 se agrupa por su /64; la IPv4 y la IPv6 mapeada a IPv4 no cambian", () => {
  assert.equal(agruparIpv6("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(agruparIpv6("2001:DB8:1:2:ffff:ffff:ffff:ffff"), "2001:db8:1:2::/64"); // rotar dentro del /64 no cambia la clave
  assert.equal(agruparIpv6("2001:db8::1"), agruparIpv6("2001:db8::2"));
  assert.equal(agruparIpv6("::1"), "0:0:0:0::/64");
  assert.equal(agruparIpv6("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(agruparIpv6("1.2.3.4"), "1.2.3.4");
  assert.notEqual(agruparIpv6("2001:db8:1:2::1"), agruparIpv6("2001:db8:1:3::1"));
});

test("la clave es un hash de 64 caracteres, distinto por ámbito, y no contiene la IP", () => {
  const k = claveIp("empresa", "1.2.3.4", "sal-uno-0123456789ab");
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.notEqual(k, claveIp("usuaria", "1.2.3.4", "sal-uno-0123456789ab"));
  assert.notEqual(k, claveIp("empresa", "1.2.3.4", "sal-dos-0123456789ab")); // otra sal, otra clave
  assert.ok(!k.includes("1.2.3.4"));
});

test("sin IP no bloquea ni anota; con IP bloquea al llegar al máximo", async () => {
  const llamadas: string[] = [];
  let fallos = 0;
  const bd = { query: async (sql: string) => { llamadas.push(sql); return { rows: sql.startsWith("SELECT") ? [{ fallos }] : [] }; } };
  assert.equal(await ipBloqueada(bd, "empresa", null), false);
  await anotarFalloIp(bd, "empresa", null);
  assert.equal(llamadas.length, 0);
  await anotarFalloIp(bd, "empresa", "1.2.3.4");
  assert.ok(llamadas[0].startsWith("DELETE FROM intentos_ip"), "al anotar también se limpian las filas viejas");
  llamadas.length = 0;
  fallos = MAX_FALLOS_IP - 1;
  assert.equal(await ipBloqueada(bd, "empresa", "1.2.3.4"), false);
  fallos = MAX_FALLOS_IP;
  assert.equal(await ipBloqueada(bd, "empresa", "1.2.3.4"), true);
});

test("la consulta de anotar reinicia la ventana vencida y no guarda la IP", () => {
  assert.match(SQL_ANOTAR_FALLO, /ON CONFLICT \(clave\)/);
  assert.match(SQL_ANOTAR_FALLO, /THEN 1 ELSE intentos_ip\.fallos \+ 1/);
  assert.doesNotMatch(SQL_ANOTAR_FALLO, /\bip\b\s+text/i);
});

test("el login y el registro de usuarias usan el límite por IP, cada uno en su ámbito", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/entrar/actions.ts", import.meta.url), "utf-8");
  assert.match(src, /ipBloqueada\(db\(\), "usuaria", ip\)/);
  assert.match(src, /anotarFalloIp\(db\(\), "usuaria", ip\)/);
  assert.match(src, /ipBloqueada\(db\(\), "registro", ip, MAX_REGISTROS_IP\)/);
  assert.match(src, /anotarFalloIp\(db\(\), "registro", ip\)/);
  assert.match(src, /ipDelCliente\(\(await headers\(\)\)\.get\("x-forwarded-for"\)\)/); // la IP solo sale de ipDelCliente (exige proxy de confianza y sal)
});

test("avisoConfigIp avisa solo si hay proxy declarado y la sal falta o es corta", () => {
  assert.match(avisoConfigIp(true, "") ?? "", /APAGADO/);
  assert.match(avisoConfigIp(true, "corta") ?? "", /APAGADO/);
  assert.equal(avisoConfigIp(true, "x".repeat(16)), null);
  assert.equal(avisoConfigIp(false, ""), null);
});
