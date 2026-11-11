// Pruebas de /salud: semáforos y lectura de evals. Datos inventados. Se ejecutan con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  peor, piezaBaseDatos, piezaEventos, piezaFuente, piezaOfertas, piezaVerificacion, piezaEvals,
  resumirEvals, leerUltimosEvals, migracionesEnDisco, SQL_EVENTOS, SQL_CALIDAD_OFERTAS,
} from "./salud.ts";
import { estadoEjecucion, HORAS_ABANDONADA } from "./panel.ts";

const AHORA = new Date("2026-11-10T12:00:00Z");
const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000);

test("peor: el color más grave gana y vacío es gris", () => {
  assert.equal(peor(["verde", "ambar", "verde"]), "ambar");
  assert.equal(peor(["verde", "rojo", "ambar"]), "rojo");
  assert.equal(peor(["gris", "verde"]), "verde");
  assert.equal(peor([]), "gris");
});

test("base de datos: sin respuesta es rojo, con migraciones pendientes ámbar", () => {
  assert.equal(piezaBaseDatos(null, 8).estado, "rojo");
  assert.equal(piezaBaseDatos(7, 8).estado, "ambar");
  assert.equal(piezaBaseDatos(8, 8).estado, "verde");
});

test("eventos: el último error pesa más que los antiguos", () => {
  const f = { componente: "importador", ultimo: AHORA, recientes: 4, errores: 1 };
  assert.equal(piezaEventos({ ...f, ultimo_resultado: "error" }).estado, "rojo");
  assert.equal(piezaEventos({ ...f, ultimo_resultado: "ok" }).estado, "ambar");
  assert.equal(piezaEventos({ ...f, ultimo_resultado: "ok", errores: 0 }).estado, "verde");
});

test("ejecución abandonada: sin cierre y con más de 6 horas", () => {
  const u = (h: number) => ({ ultima_inicio: hace(h), ultima_fin: null, ultima_errores: 0 });
  assert.equal(estadoEjecucion(u(1), AHORA), "sin terminar");
  assert.equal(estadoEjecucion(u(HORAS_ABANDONADA + 1), AHORA), "abandonada");
  // Con cierre nunca es abandonada, por antigua que sea.
  assert.equal(estadoEjecucion({ ultima_inicio: hace(900), ultima_fin: hace(899), ultima_errores: 0 }, AHORA), "correcta");
});

test("fuentes: apagada es gris; abandonada, roja; correcta, verde", () => {
  const base = { nombre: "X", activa: true, ultima_inicio: hace(2), ultima_fin: hace(2), ultima_errores: 0 };
  assert.equal(piezaFuente({ ...base, activa: false }, AHORA).estado, "gris");
  assert.equal(piezaFuente(base, AHORA).estado, "verde");
  assert.equal(piezaFuente({ ...base, ultima_errores: 2 }, AHORA).estado, "rojo");
  assert.equal(piezaFuente({ ...base, ultima_fin: null, ultima_inicio: hace(30) }, AHORA).estado, "rojo");
  assert.equal(piezaFuente({ ...base, ultima_fin: null }, AHORA).estado, "ambar");
  assert.equal(piezaFuente({ ...base, ultima_inicio: null, ultima_fin: null }, AHORA).estado, "gris");
});

test("ofertas: sin licencia es rojo; huecos de taxonomía, ámbar; vacío, gris", () => {
  const c = { total: 10, sin_sector: 0, sin_familia: 0, sin_licencia: 0, con_avisos: 2 };
  assert.equal(piezaOfertas({ ...c, total: 0 }).estado, "gris");
  assert.equal(piezaOfertas(c).estado, "verde");
  assert.equal(piezaOfertas({ ...c, sin_familia: 4 }).estado, "ambar");
  assert.equal(piezaOfertas({ ...c, sin_licencia: 1, sin_familia: 4 }).estado, "rojo");
});

test("verificación: nunca corrida gris, con fallos roja, antigua ámbar", () => {
  assert.equal(piezaVerificacion(null, AHORA).estado, "gris");
  assert.equal(piezaVerificacion({ ts: hace(1), resultado: "ok", detalle: { coinciden: 20, fallos: 0 } }, AHORA).estado, "verde");
  assert.equal(piezaVerificacion({ ts: hace(1), resultado: "error", detalle: { coinciden: 18, fallos: 2 } }, AHORA).estado, "rojo");
  assert.equal(piezaVerificacion({ ts: hace(24 * 20), resultado: "ok", detalle: { coinciden: 20, fallos: 0 } }, AHORA).estado, "ambar");
  // Un detalle ausente no rompe la página.
  assert.equal(piezaVerificacion({ ts: hace(1), resultado: "ok", detalle: undefined as never }, AHORA).estado, "verde");
});

test("resumirEvals ignora lo que no tiene la forma esperada", () => {
  assert.deepEqual(resumirEvals(null), []);
  assert.deepEqual(resumirEvals([1, 2]), []);
  assert.deepEqual(
    resumirEvals({ cv: [{ ok: true }, { ok: false }, null, "x"], raro: "texto", ats: [{ ok: true }] }),
    [{ nombre: "cv", total: 2, ok: 1 }, { nombre: "ats", total: 1, ok: 1 }],
  );
});

test("evals: lee el archivo más reciente, ignora otros nombres y enlaces, y puntúa", () => {
  const dir = mkdtempSync(join(tmpdir(), "horma-salud-"));
  try {
    assert.equal(leerUltimosEvals(join(dir, "no-existe")), null);
    writeFileSync(join(dir, "2026-11-05-codigo.json"), JSON.stringify({ cv: [{ ok: false }] }));
    writeFileSync(join(dir, "2026-11-09-codigo.json"), JSON.stringify({ cv: [{ ok: true }], ats: [{ ok: true }] }));
    writeFileSync(join(dir, "2026-11-30-otro.json"), JSON.stringify({ cv: [{ ok: false }] }));
    writeFileSync(join(dir, "2026-11-20-codigo.json"), "esto no es JSON");
    // El más reciente por nombre (20-nov) está roto: se avisa como ilegible, no se salta al anterior en silencio.
    assert.equal(leerUltimosEvals(dir)?.ilegible, true);
    assert.equal(piezaEvals(leerUltimosEvals(dir), AHORA).estado, "ambar");
    rmSync(join(dir, "2026-11-20-codigo.json"));
    const r = leerUltimosEvals(dir)!;
    assert.equal(r.archivo, "2026-11-09-codigo.json");
    assert.equal(piezaEvals(r, AHORA).estado, "verde");
    assert.equal(piezaEvals(r, new Date("2026-12-30T00:00:00Z")).estado, "ambar");
    assert.equal(piezaEvals({ ...r, conjuntos: [{ nombre: "cv", total: 3, ok: 2 }] }, AHORA).estado, "rojo");
    assert.equal(piezaEvals(null, AHORA).estado, "gris");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migracionesEnDisco cuenta solo .sql y no falla si la carpeta no existe", () => {
  const dir = mkdtempSync(join(tmpdir(), "horma-mig-"));
  try {
    mkdirSync(join(dir, "m"));
    writeFileSync(join(dir, "m", "001_a.sql"), "");
    writeFileSync(join(dir, "m", "nota.txt"), "");
    assert.equal(migracionesEnDisco(join(dir, "m")), 1);
    assert.equal(migracionesEnDisco(join(dir, "nada")), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("las consultas de /salud son de solo lectura y no llevan texto de personas", () => {
  for (const sql of [SQL_EVENTOS, SQL_CALIDAD_OFERTAS]) {
    assert.match(sql.trim(), /^SELECT/i);
    assert.ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(sql));
    assert.ok(!/perfil|usuaria|cv_texto|preferencias/i.test(sql));
  }
});
