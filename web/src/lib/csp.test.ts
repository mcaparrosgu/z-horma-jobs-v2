import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { construirCsp, nuevoNonce } from "./csp.ts";

test("el nonce es distinto en cada petición y tiene entropía suficiente", () => {
  const n = new Set(Array.from({ length: 50 }, () => nuevoNonce()));
  assert.equal(n.size, 50);
  assert.match([...n][0], /^[A-Za-z0-9+/]{22}==$/); // 16 bytes en base64
});

test("la CSP de producción lleva las directivas estrictas y nada de unsafe-eval", () => {
  const c = construirCsp("abc123==");
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "connect-src 'self'", "img-src 'self' data:"]) {
    assert.ok(c.includes(d), d);
  }
  assert.match(c, /script-src 'self' 'nonce-abc123==' 'strict-dynamic'(;|$)/);
  assert.ok(!c.includes("unsafe-eval"), "producción sin unsafe-eval");
  const script = c.split("; ").find((d) => d.startsWith("script-src"))!;
  assert.ok(!script.includes("unsafe-inline"), "los scripts en línea solo con nonce");
  assert.ok(!c.includes("*"), "sin comodines");
});

test("unsafe-eval solo aparece en desarrollo", () => {
  assert.ok(construirCsp("x", true).includes("'unsafe-eval'"));
});

// Texto siempre escapado (pista B): nada de HTML sin escapar ni evaluación de texto en la web. Lista blanca vacía: si algún día
// hace falta, se añade aquí a propósito, con su motivo y una sanitización probada.
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx|mjs)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}

test("la web no usa dangerouslySetInnerHTML, innerHTML, eval, new Function ni document.write", () => {
  const prohibido = [/dangerouslySetInnerHTML/, /\.innerHTML\b/, /\.outerHTML\s*=/, /\beval\s*\(/, /new\s+Function\s*\(/, /document\.write\s*\(/, /insertAdjacentHTML/];
  const raiz = join(process.cwd(), "src");
  const hallazgos: string[] = [];
  for (const f of archivos(raiz)) {
    const t = readFileSync(f, "utf8");
    for (const re of prohibido) if (re.test(t)) hallazgos.push(`${f.slice(raiz.length + 1)}: ${re}`);
  }
  assert.deepEqual(hallazgos, []);
});
