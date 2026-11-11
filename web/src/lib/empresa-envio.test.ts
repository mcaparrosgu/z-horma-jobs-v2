import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SQL_BANDEJA, SQL_CAMBIAR_ESTADO_BANDEJA, SQL_CANDIDATURA_PARA_ENVIAR, SQL_ENVIAR_A_EMPRESA, SQL_RETIRAR_ENVIO,
  ESTADOS_BANDEJA, estadoBandejaValido, NOMBRE_CONTACTO_MAX, modoDeEnvio,
} from "./empresa-envio.ts";

// Línea roja (AI Act, Anexo III.4): Horma nunca ordena, filtra ni puntúa candidatas para una empresa.
// Esta prueba falla a propósito si alguien añade un ORDER BY distinto de la fecha, un WHERE que filtre
// contenido, o cualquier mención de nota/traza/ATS/huecos/perfil/preferencias en la consulta de la bandeja.
test("la bandeja de la empresa: solo por fecha de recepción, sin filtros ni notas, y nunca datos fuera del CV/carta aprobados", () => {
  assert.match(SQL_BANDEJA, /ORDER BY enviado_en\s*$/);
  assert.ok(!/ORDER BY[^`]*(nota|score|puntu|ranking|compat|match|calidad)/i.test(SQL_BANDEJA), "la bandeja no puede ordenar por calidad");
  assert.ok(!/\bWHERE\b[^`]*(cv_md|carta_md|contacto)/i.test(SQL_BANDEJA), "la bandeja no puede filtrar por contenido");
  assert.ok(!/\b(nota|traza|ats|huecos|perfil|preferencias|candidaturas)\b/i.test(SQL_BANDEJA), "la bandeja nunca toca esas tablas o campos");
  assert.match(SQL_BANDEJA, /WHERE oferta_id = \$1 AND empresa_id = \$2/);
});

test("cambiar el estado de la bandeja va siempre filtrado por la empresa de la sesión", () => {
  assert.match(SQL_CAMBIAR_ESTADO_BANDEJA, /WHERE id = \$1 AND empresa_id = \$2/);
  assert.doesNotMatch(SQL_CAMBIAR_ESTADO_BANDEJA, /\bnota\b/i);
});

test("enviar y retirar van siempre filtrados por la usuaria de la sesión, nunca por una lista", () => {
  assert.match(SQL_CANDIDATURA_PARA_ENVIAR, /WHERE c\.usuaria_id = \$1 AND c\.oferta_id = \$2/);
  assert.doesNotMatch(SQL_CANDIDATURA_PARA_ENVIAR, /\b(nota|traza|huecos|ats)\b/i);
  assert.match(SQL_RETIRAR_ENVIO, /WHERE usuaria_id = \$1 AND oferta_id = \$2\s*$/);
  assert.match(SQL_ENVIAR_A_EMPRESA, /INSERT INTO envios_empresa/);
  assert.doesNotMatch(SQL_ENVIAR_A_EMPRESA, /\b(nota|traza|huecos|ats|preferencias)\b/i);
});

test("estadoBandejaValido: solo los cuatro valores cerrados, nunca texto libre", () => {
  for (const v of ESTADOS_BANDEJA) assert.equal(estadoBandejaValido(v), true, v);
  for (const malo of ["", "aprobada", "rechazada", "recibida ", "<script>", null, 5, "RECIBIDA"]) {
    assert.equal(estadoBandejaValido(malo), false, JSON.stringify(malo));
  }
});

test("el nombre de contacto tiene un tope razonable", () => {
  assert.equal(NOMBRE_CONTACTO_MAX, 200);
});

test("enviar: solo a ofertas aprobadas (una cerrada, rechazada o en revisión no admite envíos)", () => {
  assert.match(SQL_CANDIDATURA_PARA_ENVIAR, /o\.estado_publicacion = 'aprobada'/);
});

test("reenviar tras retirar: solo una enviada por el portal, sin envío vivo; nunca otro estado, otro canal o con la copia aún en la bandeja", () => {
  const portal = [{ estado: "aprobada" }, { estado: "enviada", canal: "portal de Horma" }];
  assert.equal(modoDeEnvio({ estado: "aprobada", envio_vivo: false }), "primero");
  assert.equal(modoDeEnvio({ estado: "aprobada", envio_vivo: true }), null);
  assert.equal(modoDeEnvio({ estado: "enviada", historial: portal, envio_vivo: false }), "reenvio");
  assert.equal(modoDeEnvio({ estado: "enviada", historial: portal, envio_vivo: true }), null, "con el envío vivo no se duplica");
  assert.equal(modoDeEnvio({ estado: "enviada", historial: [{ estado: "enviada", canal: "LinkedIn" }], envio_vivo: false }), null, "enviada por otro canal: no es del portal");
  assert.equal(modoDeEnvio({ estado: "enviada", historial: [], envio_vivo: false }), null);
  assert.equal(modoDeEnvio({ estado: "enviada", envio_vivo: false }), null);
  for (const e of ["borrador", "pendiente_de_ti", "entrevista", "rechazada", "sin_respuesta", "descartada"]) {
    assert.equal(modoDeEnvio({ estado: e, historial: portal, envio_vivo: false }), null, e);
  }
  assert.match(SQL_CANDIDATURA_PARA_ENVIAR, /AS envio_vivo/);
});
