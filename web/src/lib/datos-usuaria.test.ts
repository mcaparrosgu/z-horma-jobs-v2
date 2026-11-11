import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep as sepSistema } from "node:path";
import { carpetasDe, idValido, inspeccionar, copiarA, aCuarentena, restaurar, purgarCuarentena, rutaCorta, SQL_EXPORTAR } from "./datos-usuaria.ts";

function raizDePrueba() {
  const raiz = mkdtempSync(join(tmpdir(), "horma-datos-"));
  for (const c of ["usuarias", "candidaturas", "matches"]) {
    for (const id of ["ana-prueba", "leo-prueba"]) {
      mkdirSync(join(raiz, c, id, "sub"), { recursive: true });
      writeFileSync(join(raiz, c, id, "a.txt"), `${c}/${id}`);
      writeFileSync(join(raiz, c, id, "sub", "b.txt"), "x");
    }
  }
  return raiz;
}

test("rechaza ids con rutas, mayúsculas, puntos, guion inicial o nombres reservados de Windows", () => {
  const raiz = raizDePrueba();
  const malos = ["../x", "a/b", "a\\b", "..", ".oculto", "", "x".repeat(81), "a b",
    "Ana", "ana.", "ana..", "a.b", "-confirmar", "--x", "con", "nul", "aux", "com1", "lpt9", "prn"];
  for (const id of malos) {
    assert.equal(idValido(id), false, id);
    assert.throws(() => carpetasDe(raiz, id), /no válido/, id);
  }
  for (const id of ["ana-prueba", "ana_1", "0abc", "_x", "console", "ana-datos"]) assert.equal(idValido(id), true, id);
});

test("inspeccionar cuenta archivos solo de esa usuaria", () => {
  const h = inspeccionar(raizDePrueba(), "ana-prueba");
  assert.equal(h.length, 3);
  assert.ok(h.every((x) => x.archivos === 2));
});

test("una usuaria sin datos en disco da lista vacía", () => {
  assert.deepEqual(inspeccionar(raizDePrueba(), "nadie"), []);
});

test("copiarA copia las tres carpetas y deja el origen intacto", () => {
  const raiz = raizDePrueba();
  const destino = join(mkdtempSync(join(tmpdir(), "horma-exp-")), "salida");
  copiarA(raiz, "ana-prueba", destino);
  assert.equal(readFileSync(join(destino, "usuarias", "a.txt"), "utf8"), "usuarias/ana-prueba");
  assert.ok(existsSync(join(raiz, "usuarias", "ana-prueba", "a.txt")));
});

test("cuarentena: mueve solo a esa usuaria; purgar borra; restaurar lo deja como estaba", () => {
  const raiz = raizDePrueba();
  assert.equal(aCuarentena(raiz, "ana-prueba"), 6);
  for (const c of ["usuarias", "candidaturas", "matches"]) {
    assert.ok(!existsSync(join(raiz, c, "ana-prueba")), "ya no está en su sitio");
    assert.ok(existsSync(join(raiz, c, "leo-prueba", "a.txt")), "la otra usuaria sigue");
  }
  assert.ok(existsSync(join(raiz, ".borrando-ana-prueba", "usuarias", "a.txt")));
  restaurar(raiz, "ana-prueba");
  for (const c of ["usuarias", "candidaturas", "matches"]) assert.ok(existsSync(join(raiz, c, "ana-prueba", "sub", "b.txt")));
  assert.ok(!existsSync(join(raiz, ".borrando-ana-prueba")));
  aCuarentena(raiz, "ana-prueba");
  purgarCuarentena(raiz, "ana-prueba");
  assert.ok(!existsSync(join(raiz, ".borrando-ana-prueba")));
  assert.ok(existsSync(join(raiz, "usuarias", "leo-prueba", "a.txt")));
});

test("un enlace simbólico dentro de los datos aborta antes de mover o copiar nada", (t) => {
  const raiz = raizDePrueba();
  const fuera = mkdtempSync(join(tmpdir(), "horma-fuera-"));
  writeFileSync(join(fuera, "secreto.txt"), "no tocar");
  try { symlinkSync(fuera, join(raiz, "matches", "ana-prueba", "enlace"), "junction"); }
  catch { t.skip("este sistema no permite crear enlaces"); return; }
  assert.throws(() => aCuarentena(raiz, "ana-prueba"), /enlace simbólico/);
  assert.ok(existsSync(join(raiz, "usuarias", "ana-prueba", "a.txt")), "no se movió nada");
  assert.ok(existsSync(join(fuera, "secreto.txt")));
  assert.throws(() => copiarA(raiz, "ana-prueba", join(fuera, "dest")), /enlace simbólico/);
  rmSync(join(raiz, "matches", "ana-prueba", "enlace"));
});

test("una carpeta padre que es un enlace (datos/matches) aborta", (t) => {
  const raiz = raizDePrueba();
  const fuera = mkdtempSync(join(tmpdir(), "horma-fuera2-"));
  mkdirSync(join(fuera, "ana-prueba"));
  writeFileSync(join(fuera, "ana-prueba", "secreto.txt"), "no tocar");
  rmSync(join(raiz, "matches"), { recursive: true });
  try { symlinkSync(fuera, join(raiz, "matches"), "junction"); }
  catch { t.skip("este sistema no permite crear enlaces"); return; }
  assert.throws(() => inspeccionar(raiz, "ana-prueba"), /enlace simbólico/);
  assert.ok(existsSync(join(fuera, "ana-prueba", "secreto.txt")));
});

test("exportar incluye la cuenta SIN contraseña ni identificador de Google", () => {
  assert.ok(SQL_EXPORTAR.cuenta);
  assert.doesNotMatch(SQL_EXPORTAR.cuenta, /hash|google_sub\s*[,)]\s*'|to_jsonb\(c\)/);
  assert.match(SQL_EXPORTAR.cuenta, /'email'/);
});

test("rutaCorta no deja el id de la usuaria en ninguna carpeta de datos (con / y con barra invertida)", () => {
  const raiz = join(tmpdir(), "datos");
  for (const carpeta of ["perfiles", "usuarias", "matches", "candidaturas"]) {
    for (const sep of ["/", "\\"]) {
      const ruta = join(raiz, `${carpeta}${sep}auto-secreta-77${sep}perfil.json`);
      const corta = rutaCorta(raiz, ruta);
      assert.ok(!corta.includes("auto-secreta-77"), `${carpeta}: ${corta}`);
      assert.ok(corta.includes("(usuaria)"), corta);
    }
  }
  // lo que no es de usuaria se deja tal cual
  assert.equal(rutaCorta(raiz, join(raiz, "ofertas", "of-1.json")).split(sepSistema).join("/"), "ofertas/of-1.json");
});
