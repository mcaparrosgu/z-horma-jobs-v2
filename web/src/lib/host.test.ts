import test from "node:test";
import assert from "node:assert/strict";
import { hostPermitido } from "./host.ts";

test("acepta localhost y 127.0.0.1, con o sin puerto", () => {
  for (const h of ["localhost", "localhost:3000", "127.0.0.1", "127.0.0.1:3000", "LOCALHOST:3000"]) {
    assert.equal(hostPermitido(h), true, h);
  }
});

test("rechaza dominios ajenos, aunque resuelvan a 127.0.0.1", () => {
  for (const h of ["evil.com", "evil.com:3000", "127.0.0.1.evil.com", "localhost.evil.com:3000", "0.0.0.0:3000", "[::1]:3000", ""]) {
    assert.equal(hostPermitido(h), false, h);
  }
});

test("rechaza si falta la cabecera Host", () => {
  assert.equal(hostPermitido(null), false);
});
