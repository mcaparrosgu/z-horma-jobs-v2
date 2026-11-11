import { test } from "node:test";
import assert from "node:assert/strict";
import { SQL_CANDIDATURAS, huecosConAviso, huecosSinCubrir, porcentaje, ETIQUETA_ESTADO } from "./candidaturas.ts";

test("la consulta siempre filtra por usuaria y no trae la traza", () => {
  assert.match(SQL_CANDIDATURAS, /WHERE c\.usuaria_id = \$1/);
  assert.doesNotMatch(SQL_CANDIDATURAS, /traza/);
});
test("los huecos con aviso de relleno van aparte de los demás", () => {
  const h = [{ requisito: "a", propuesta: "p", decision: "pendiente", relleno_aviso: "se reformuló X" }, { requisito: "b", propuesta: "q", decision: "pendiente", relleno_aviso: null }];
  assert.equal(huecosConAviso(h).length, 1);
  assert.equal(huecosSinCubrir(h)[0].requisito, "b");
});
test("el porcentaje se acota entre 0 y 100", () => {
  assert.equal(porcentaje(0.6), "60 %"); assert.equal(porcentaje(2), "100 %"); assert.equal(porcentaje(-1), "0 %");
});
test("todos los estados del esquema tienen etiqueta", () => {
  for (const e of ["borrador", "aprobada", "enviada", "entrevista", "rechazada", "sin_respuesta", "descartada", "pendiente_de_ti"]) assert.ok(ETIQUETA_ESTADO[e]);
});

test("aprobar: solo desde borrador, siempre por la usuaria de la sesión y firmado «usuaria»", async () => {
  const { SQL_APROBAR } = await import("./candidaturas.ts");
  assert.match(SQL_APROBAR, /WHERE usuaria_id = \$1 AND oferta_id = \$2 AND estado = 'borrador'/);
  assert.match(SQL_APROBAR, /'por', 'usuaria'/);
  assert.match(SQL_APROBAR, /actualizado_en\) = \$3::timestamptz/); // solo se aprueba la versión que ella leyó
  assert.ok(!/jsonb_build_object\([^)]*\$3/.test(SQL_APROBAR), "ningún dato del formulario entra en el historial");
});

test("marcar enviada: solo desde aprobada y solo si el historial lleva la aprobación firmada por la usuaria", async () => {
  const { SQL_MARCAR_ENVIADA, canalValido, CANALES, ID_OFERTA } = await import("./candidaturas.ts");
  assert.match(SQL_MARCAR_ENVIADA, /estado = 'aprobada'/);
  assert.match(SQL_MARCAR_ENVIADA, /e->>'estado' = 'aprobada' AND e->>'por' = 'usuaria'/);
  assert.match(SQL_MARCAR_ENVIADA, /WHERE usuaria_id = \$1 AND oferta_id = \$2/);
  for (const c of CANALES) assert.equal(canalValido(c), true);
  for (const c of ["", "otro canal", "<script>", "linkedin", null, 5]) assert.equal(canalValido(c), false);
  assert.ok(ID_OFERTA.test("of-prueba-1") && !ID_OFERTA.test("../x") && !ID_OFERTA.test("a b"));
});

test("destinosDe: exactamente los mismos pares que el disparador candidaturas_transicion (migración 017)", async () => {
  const { destinosDe } = await import("./candidaturas.ts");
  assert.deepEqual([...destinosDe("enviada")], ["entrevista", "rechazada", "sin_respuesta"]);
  assert.deepEqual([...destinosDe("entrevista")], ["rechazada"]);
  assert.deepEqual([...destinosDe("borrador")], ["descartada"]);
  assert.deepEqual([...destinosDe("aprobada")], ["descartada"]);
  assert.deepEqual([...destinosDe("pendiente_de_ti")], ["descartada"]);
  assert.deepEqual([...destinosDe("descartada")], []); // estado final: no hay destino
  assert.deepEqual([...destinosDe("rechazada")], []);
  assert.deepEqual([...destinosDe("sin_respuesta")], []);
});

test("registrar respuesta: solo mueve una fila cuando el par origen→destino es uno de los permitidos", async () => {
  const { SQL_REGISTRAR_RESPUESTA } = await import("./candidaturas.ts");
  assert.match(SQL_REGISTRAR_RESPUESTA, /WHERE usuaria_id = \$1 AND oferta_id = \$2/);
  assert.match(SQL_REGISTRAR_RESPUESTA, /estado = 'enviada' AND \$3 IN \('entrevista', 'rechazada', 'sin_respuesta'\)/);
  assert.match(SQL_REGISTRAR_RESPUESTA, /estado = 'entrevista' AND \$3 = 'rechazada'/);
  assert.match(SQL_REGISTRAR_RESPUESTA, /estado IN \('borrador', 'aprobada', 'pendiente_de_ti'\) AND \$3 = 'descartada'/);
  assert.match(SQL_REGISTRAR_RESPUESTA, /'por', 'usuaria'/);
});

test("sinRespuestaTrasDias: solo avisa si sigue «enviada» y pasaron 21 días o más, nunca antes ni en otro estado", async () => {
  const { sinRespuestaTrasDias, DIAS_SIN_RESPUESTA } = await import("./candidaturas.ts");
  const ahora = new Date("2026-11-27T00:00:00Z");
  const hace20 = new Date("2026-11-07T00:00:01Z");
  const hace21 = new Date("2026-11-06T00:00:00Z");
  assert.equal(DIAS_SIN_RESPUESTA, 21);
  assert.equal(sinRespuestaTrasDias("enviada", hace20, ahora), false);
  assert.equal(sinRespuestaTrasDias("enviada", hace21, ahora), true);
  assert.equal(sinRespuestaTrasDias("entrevista", hace21, ahora), false); // ya hay respuesta: no avisa
  assert.equal(sinRespuestaTrasDias("borrador", hace21, ahora), false);
});
