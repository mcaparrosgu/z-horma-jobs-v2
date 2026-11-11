// Pruebas de la calidad de ofertas (A1): URL canónica, huella, grupos sin pérdida de filas y reglas de vigencia.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  urlCanonica, normalizarTitulo, normalizarEmpresa, normalizarMunicipio, semanaDe, huellas,
  vigencia, etiquetaTransparencia, DIAS_SIN_VER,
} from "./calidad-ofertas.ts";

test("URL canónica: sin seguimiento, minúsculas en esquema y host, sin barra final ni fragmento", () => {
  assert.equal(
    urlCanonica("HTTPS://Www.Ejemplo.ES/Ofertas/123/?utm_source=x&UTM_medium=y&fbclid=a&gclid=b&id=7#arriba"),
    "https://www.ejemplo.es/Ofertas/123?id=7",
  );
  assert.equal(urlCanonica("https://ejemplo.es/"), "https://ejemplo.es");
  assert.equal(urlCanonica("https://ejemplo.es/a?b=2&a=1"), urlCanonica("https://ejemplo.es/a/?a=1&b=2&utm_campaign=z"));
  assert.equal(urlCanonica("https://ejemplo.es:443/a"), "https://ejemplo.es/a");
});

test("URL canónica: dos URL de la misma oferta coinciden y dos ofertas distintas no", () => {
  assert.equal(urlCanonica("https://x.es/o/1?utm_source=a"), urlCanonica("https://X.es/o/1/"));
  assert.notEqual(urlCanonica("https://x.es/o/1"), urlCanonica("https://x.es/o/2"));
  assert.notEqual(urlCanonica("https://x.es/o?id=1"), urlCanonica("https://x.es/o?id=2"));
});

test("URL canónica: lo que no es una URL no lanza", () => {
  assert.equal(urlCanonica("  No Es Url  "), "no es url");
  assert.equal(urlCanonica(""), "");
});

test("el título se normaliza: tildes, mayúsculas y marcas de género", () => {
  assert.equal(normalizarTitulo("Desarrollador/a Frontend (m/f)"), "desarrollador a frontend");
  assert.equal(normalizarTitulo("Técnico de Sistemas (H/M/D)"), "tecnico de sistemas");
  assert.equal(normalizarTitulo("Analista  de   datos h/m"), "analista de datos");
  assert.equal(normalizarTitulo("Analista de datos (f/m/x) – Madrid"), "analista de datos madrid");
  assert.equal(normalizarTitulo("Ingeniero de Software"), normalizarTitulo("INGENIERO DE  SOFTWARE (m/f)"));
});

test("la empresa se normaliza: sin formas jurídicas ni tildes", () => {
  assert.equal(normalizarEmpresa("Acme Soluciones, S.L."), "acme soluciones");
  assert.equal(normalizarEmpresa("ACME SOLUCIONES SLU"), "acme soluciones");
  assert.equal(normalizarEmpresa("Ñandú Consulting S.A.U."), "nandu consulting");
  assert.equal(normalizarEmpresa("Acme Soluciones"), "acme soluciones");
  assert.equal(normalizarEmpresa("SL"), "sl"); // no se vacía
  assert.equal(normalizarEmpresa("Salamanca Sistemas"), "salamanca sistemas"); // «sa» dentro de una palabra no cuenta
});

test("el municipio es lo que va antes de la coma o el paréntesis", () => {
  assert.equal(normalizarMunicipio("Madrid, España"), "madrid");
  assert.equal(normalizarMunicipio("Málaga (Andalucía)"), "malaga");
  assert.equal(normalizarMunicipio("Sant Cugat del Vallès - Barcelona"), "sant cugat del valles");
});

test("la semana ISO es la de lunes a domingo y tolera fechas raras", () => {
  assert.equal(semanaDe("2026-11-02"), "2026-W45"); // lunes
  assert.equal(semanaDe("2026-11-08"), "2026-W45"); // domingo
  assert.equal(semanaDe("2026-11-09"), "2026-W46");
  assert.equal(semanaDe("2026-01-01"), "2026-W01");
  assert.equal(semanaDe("2025-12-31"), "2026-W01"); // el año ISO cambia antes que el natural
  assert.equal(semanaDe("2021-01-03"), "2020-W53");
  assert.equal(semanaDe(null), "sin-fecha");
  assert.equal(semanaDe("no es fecha"), "sin-fecha");
  assert.equal(semanaDe("2026-02-31"), "sin-fecha");
  assert.equal(semanaDe(new Date("2026-11-04T10:00:00Z")), "2026-W45");
});

test("la huella: la misma oferta de dos fuentes coincide aunque cambie el formato", () => {
  const a = huellas({ empresa: "Acme Soluciones, S.L.", titulo: "Desarrollador/a Web (m/f)", ubicacion: "Madrid, España", fecha: "2026-11-03" });
  const b = huellas({ empresa: "ACME SOLUCIONES SL", titulo: "desarrollador/a web (h/m/d)", ubicacion: "Madrid (Madrid)", fecha: "2026-11-05" });
  assert.equal(a.huella, b.huella);
  assert.equal(a.huellaBase, b.huellaBase);
});

test("la huella: distinto puesto, empresa o municipio no coinciden; otra semana cambia la huella pero no la base", () => {
  const o = { empresa: "Acme", titulo: "Analista", ubicacion: "Madrid", fecha: "2026-11-03" };
  const h = huellas(o);
  assert.notEqual(huellas({ ...o, titulo: "Analista senior" }).huella, h.huella);
  assert.notEqual(huellas({ ...o, empresa: "Otra" }).huella, h.huella);
  assert.notEqual(huellas({ ...o, ubicacion: "Sevilla" }).huella, h.huella);
  const otraSemana = huellas({ ...o, fecha: "2026-11-17" });
  assert.notEqual(otraSemana.huella, h.huella);
  assert.equal(otraSemana.huellaBase, h.huellaBase);
});

test("regla 1: una fecha de cierre anterior a hoy cierra la oferta; hoy todavía no", () => {
  assert.equal(vigencia({ fecha_cierre: "2026-11-06" }, "2026-11-07").cerrada, true);
  assert.equal(vigencia({ fecha_cierre: "2026-11-07" }, "2026-11-07").cerrada, false);
  assert.equal(vigencia({ fecha_cierre: null }, "2026-11-07").cerrada, false);
  assert.equal(vigencia({}, "2026-11-07").cerrada, false);
});

test("regla 2: más de 45 días sin verla, «puede no estar vigente»; si no hay última vista, cuenta la fecha", () => {
  assert.equal(DIAS_SIN_VER, 45);
  const hoy = "2026-11-07";
  assert.equal(vigencia({ ultima_vista: "2026-09-23T10:00:00Z" }, hoy).puedeNoEstarVigente, false); // 45 días justos
  assert.equal(vigencia({ ultima_vista: "2026-09-22T10:00:00Z" }, hoy).puedeNoEstarVigente, true); // 46
  assert.equal(vigencia({ ultima_vista: null, fecha: "2026-09-01" }, hoy).puedeNoEstarVigente, true);
  assert.equal(vigencia({ ultima_vista: "2026-11-06T00:00:00Z", fecha: "2026-01-01" }, hoy).puedeNoEstarVigente, false); // manda la última vista
  assert.equal(vigencia({}, hoy).puedeNoEstarVigente, false); // sin datos no se acusa de nada
  assert.equal(vigencia({ fecha_cierre: "2026-10-01", ultima_vista: "2026-01-01" }, hoy).puedeNoEstarVigente, false); // cerrada manda
});

test("regla 3: la recurrencia viene calculada con la lista y se refleja en la etiqueta", () => {
  assert.equal(vigencia({ recurrente: true }, "2026-11-07").recurrente, true);
  assert.equal(vigencia({}, "2026-11-07").recurrente, false);
});

test("la etiqueta de transparencia solo da hechos, sin juicios sobre la empresa", () => {
  const e = etiquetaTransparencia({
    fecha: "2026-11-02", primera_vista: "2026-11-02T08:00:00Z", ultima_vista: "2026-11-06T08:00:00Z", veces_vista: 3,
    fuente: "fuente-a", licencia: "abierto", recurrente: true,
  }, "2026-11-07");
  const texto = e.join(" · ");
  assert.match(texto, /publicada hace 5 días/);
  assert.match(texto, /vista 3 veces/);
  assert.match(texto, /fuente: fuente-a/);
  assert.match(texto, /licencia: datos abiertos/);
  assert.match(texto, /oferta recurrente/);
  assert.ok(!/fantasma|fraude|sospech|mala|poco fiable/i.test(texto), "ni un solo juicio sobre la empresa");
  assert.match(etiquetaTransparencia({ veces_vista: 1 }, "2026-11-07").join(" · "), /sin fecha · vista 1 vez · licencia: no indicada/);
  assert.match(etiquetaTransparencia({ fecha_cierre: "2026-11-01" }, "2026-11-07").join(" "), /cerrada el 2026-11-01/);
});
