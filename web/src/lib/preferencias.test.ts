// Pruebas de las preferencias de la usuaria. Se ejecutan con: npm test
import { SQL_EXPORTAR, SQL_BORRAR_USUARIA } from "./datos-usuaria.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listaDeTexto, validarPreferencias, ID_USUARIA, SQL_USUARIAS, SQL_PERFIL, SQL_PREFERENCIAS } from "./preferencias.ts";

const base = { puestos: "Analista de datos, Analista de datos, BI", ciudades: "Madrid", remoto: ["remoto", "hibrido"], sueldo_min: "30000", rango_min: "40", rango_max: "100" };

test("listaDeTexto separa, recorta y quita duplicados y vacíos", () => {
  assert.deepEqual(listaDeTexto(" a, b ,,a "), ["a", "b"]);
  assert.deepEqual(listaDeTexto(undefined), []);
  assert.equal(listaDeTexto(Array.from({ length: 50 }, (_, i) => `x${i}`).join(",")).length, 20);
});

test("preferencias correctas pasan y se normalizan", () => {
  const r = validarPreferencias({ ...base, paises: "es, fr" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.prefs.puestos, ["Analista de datos", "BI"]);
    assert.deepEqual(r.prefs.paises, ["ES", "FR"]);
    assert.equal(r.prefs.sueldo_min, 30000);
    assert.deepEqual(r.prefs.rango_compatibilidad, [40, 100]);
  }
});

test("rechaza sueldo y rango fuera de lo permitido", () => {
  for (const mal of [{ sueldo_min: "abc" }, { sueldo_min: "-5" }, { rango_min: "90", rango_max: "10" }, { rango_max: "101" }, { rango_min: "4.5" }, { rango_min: "" }]) {
    assert.equal(validarPreferencias({ ...base, ...mal }).ok, false, JSON.stringify(mal));
  }
});

test("ignora modalidades que no existen y no admite campos de categorías especiales", () => {
  const r = validarPreferencias({ ...base, remoto: ["remoto", "x'--"], edad: "30", nacionalidad: "es" } as never);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.prefs.remoto, ["remoto"]);
    assert.ok(!("edad" in r.prefs) && !("nacionalidad" in r.prefs));
  }
});

test("los países deben ser códigos de 2 letras", () => {
  assert.equal(validarPreferencias({ ...base, paises: "España" }).ok, false);
  assert.equal(validarPreferencias({ ...base, paises: "es, fr" }).ok, true);
});

test("el id de usuaria solo admite caracteres seguros", () => {
  assert.ok(ID_USUARIA.test("ana-datos"));
  for (const mal of ["", "../x", "a b", "a;b", "x'--", ".oculto", "a".repeat(81), "Ana", "ANA-datos"]) assert.equal(ID_USUARIA.test(mal), false, mal);
});

test("línea roja: nada lee candidatas fuera de la lista blanca, nada ordena por nota, y el portal de empresas (bloque 3) no usa la sesión de candidata ni lee sus tablas", () => {
  assert.match(SQL_PERFIL, /WHERE usuaria_id = \$1/);
  assert.match(SQL_PREFERENCIAS, /WHERE usuaria_id = \$1/);
  assert.match(SQL_USUARIAS, /ORDER BY u\.id\s*$/); // la lista de candidatas se ordena solo por id
  assert.ok(!/empresa/i.test(SQL_USUARIAS + SQL_PERFIL + SQL_PREFERENCIAS));
  // Exportar y borrar: cada consulta toca a UNA usuaria por su id, nunca una lista.
  for (const sql of [...Object.values(SQL_EXPORTAR), SQL_BORRAR_USUARIA]) assert.match(sql, /WHERE (usuaria_id|id) = \$1\s*$/);

  const src = join(process.cwd(), "src");
  const archivos = readdirSync(src, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name) && !/\.test\.ts$/.test(d.name))
    .map((d) => ({ ruta: join(d.parentPath, d.name), nombre: d.name }));
  // Solo estos archivos pueden mencionar las tablas de candidatas (perfiles, preferencias, matches, candidaturas).
  // Un archivo nuevo que lo haga obliga a revisar esta lista a propósito.
  // datos-usuaria.ts: exportar y borrar SUS datos (RGPD), siempre por id de una sola usuaria (se comprueba arriba).
  // matches.ts y candidaturas.ts: lo que ya leían antes del bloque 3 (siempre filtrado por usuaria_id de la sesión).
  // empresa-envio.ts (bloque 4): lee la candidatura aprobada de LA USUARIA para copiar su CV/carta al enviarla a la
  // empresa (siempre WHERE usuaria_id = $1 AND oferta_id = $2, comprobado en empresa-envio.test.ts); nunca una lista.
  // datos-empresa.ts (B4-11, RGPD de empresas): solo comprueba con EXISTS (SELECT 1 …) si una oferta de la empresa tiene
  // candidaturas o recomendaciones de candidatas, para NO borrárselas al borrar la empresa. No lee ningún dato de candidatas,
  // no las lista ni las ordena (comprobado en datos-empresa.db.test.ts).
  const PUEDEN_LEER_CANDIDATAS = new Set(["preferencias.ts", "importar.ts", "esquemas.ts", "datos-usuaria.ts", "matches.ts", "candidaturas.ts", "empresa-envio.ts", "datos-empresa.ts", "respuestas.ts"]);
  for (const { ruta, nombre } of archivos) {
    const t = readFileSync(ruta, "utf8");
    if (/\b(FROM|JOIN|INTO|UPDATE)\s+(perfiles|preferencias|matches|candidaturas)\b/i.test(t)) {
      assert.ok(PUEDEN_LEER_CANDIDATAS.has(nombre), `${nombre}: lee perfiles, preferencias, matches o candidaturas fuera de la lista blanca`);
    }
    // Excepción única y acotada: matches.ts ordena las OFERTAS de UNA candidata por su nota para ella (nunca candidatas entre sí;
    // su consulta va siempre con WHERE m.usuaria_id = $1, comprobado en matches.test.ts).
    if (!ruta.replaceAll("\\", "/").endsWith("src/lib/matches.ts")) assert.ok(!/ORDER BY[^`"']*(nota|score|puntu|ranking|compat|match)/i.test(t), `${nombre}: ordena por una nota`);
    assert.ok(!/dangerouslySetInnerHTML/.test(t), `${nombre}: HTML sin sanear`);
  }

  // Portal de empresas (bloque 3): identidad aparte. Sus rutas existen (/app/empresa/), pero ninguna puede usar la
  // sesión de candidata/administración (@/lib/sesion): solo @/lib/sesion-empresa. Así una sesión de empresa nunca
  // vale para páginas de candidata ni al revés (no comparten cookie ni módulo de sesión).
  const rutasEmpresa = archivos.filter((a) => a.ruta.replaceAll("\\", "/").includes("/app/empresa/"));
  assert.ok(rutasEmpresa.length > 0, "deberían existir rutas del portal de empresas (bloque 3)");
  for (const { ruta, nombre } of rutasEmpresa) {
    const t = readFileSync(ruta, "utf8");
    assert.ok(!/@\/lib\/sesion["']/.test(t), `${nombre}: el portal de empresas no debe importar la sesión de candidata/administración`);
  }
});

test("horario: solo valores permitidos, sin duplicados, y es opcional", () => {
  const r = validarPreferencias({ ...base, horario: ["manana", "manana", "x'--", "noche"] });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.prefs.horario, ["manana", "noche"]);
  const sin = validarPreferencias({ ...base });
  assert.ok(sin.ok);
  if (sin.ok) assert.deepEqual(sin.prefs.horario, []);
});
