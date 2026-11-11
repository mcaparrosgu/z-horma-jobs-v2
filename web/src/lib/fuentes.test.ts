// Pruebas de la validación de fuentes y de los filtros de ofertas. Se ejecutan con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarFuente, paramsFuente } from "./fuentes.ts";
import { construirFiltro, sqlOfertas } from "./consultas.ts";

const buena = () => ({
  nombre: "portal-ejemplo", url: "https://api.ejemplo.eu/empleos", parametros: { pais: "es" }, cabeceras: {},
  clave_env: "FUENTE_EJEMPLO_KEY", clave_en: "cabecera", clave_nombre: "X-Portal-Id",
  mapeo_campos: { lista: "results", id: "id", titulo: "title", empresa: "company", url: "link", descripcion: "desc" },
  activa: false,
});
const errores = (f: unknown) => { const r = validarFuente(f); return r.ok ? [] : r.errores; };

test("una fuente correcta pasa y se convierte en parámetros de SQL", () => {
  const r = validarFuente(buena());
  assert.ok(r.ok);
  if (r.ok) assert.equal(paramsFuente(r.fuente).length, 10);
});

test("rechaza http, usuario en la URL y parámetros dentro de la URL", () => {
  assert.ok(errores({ ...buena(), url: "http://api.ejemplo.eu/x" }).length > 0);
  assert.ok(errores({ ...buena(), url: "https://u:p@api.ejemplo.eu/x" }).length > 0);
  assert.ok(errores({ ...buena(), url: "https://api.ejemplo.eu/x?api_key=abc" }).length > 0);
  assert.ok(errores({ ...buena(), url: "file:///etc/passwd" }).length > 0);
});

test("(d) rechaza claves metidas en cabeceras o parámetros, y no repite el valor", () => {
  const secreto = "sk-ABCDEF1234567890abcdef1234567890";
  const e1 = errores({ ...buena(), cabeceras: { Authorization: `Bearer ${secreto}` } });
  const e2 = errores({ ...buena(), parametros: { api_key: "x" } });
  const e3 = errores({ ...buena(), parametros: { q: secreto } });
  for (const e of [e1, e2, e3]) assert.ok(e.length > 0);
  assert.ok(!JSON.stringify([e1, e2, e3]).includes(secreto));
  assert.ok(!JSON.stringify(e2).includes("api_key"));
});

test("clave_env es el nombre de una variable, no una clave", () => {
  assert.ok(errores({ ...buena(), clave_env: "sk-abc123secreta" }).length > 0);
  assert.ok(errores({ ...buena(), clave_en: null }).length > 0); // con clave_env hay que decir dónde va
});

test("(i) los errores del esquema no repiten claves de nombre libre", () => {
  const e = errores({ ...buena(), parametros: { MiClaveRara123: 5 } });
  assert.ok(e.length > 0);
  assert.ok(!JSON.stringify(e).includes("MiClaveRara123"));
});

test("el nombre no admite caracteres raros", () => {
  assert.ok(errores({ ...buena(), nombre: "a'; DROP TABLE" }).length > 0);
});

test("los filtros usan parámetros y descartan valores fuera de lista", () => {
  const { where, params } = construirFiltro({ q: "100%_ok", nivel: "junior", remoto: "x'--", pais: "es", sector: "salud" });
  assert.equal(params.length, 3); // q, nivel, sector (remoto inválido y país en minúscula se ignoran)
  assert.ok(!where.includes("junior") && !where.includes("salud"));
  assert.equal(params[0], "%100\\%\\_ok%");
  assert.deepEqual(sqlOfertas({}).params, [45]); // sin filtros solo queda el umbral de «puede no estar vigente» (A1)
});

test("clave_env solo admite variables FUENTE_*: nunca la contraseña de la base", () => {
  assert.ok(errores({ ...buena(), clave_env: "HORMA_DB_PASSWORD" }).length > 0);
  assert.ok(errores({ ...buena(), clave_env: "DATABASE_URL" }).length > 0);
});

test("rechaza direcciones internas, puertos raros y claves en la ruta o en el mapeo", () => {
  for (const url of ["https://localhost/x", "https://127.0.0.1:5433/", "https://169.254.169.254/", "https://10.0.0.5/",
    "https://192.168.1.2/", "https://[::1]/", "https://intranet/x", "https://2130706433/", "https://api.ejemplo.eu:8443/x"]) {
    assert.ok(errores({ ...buena(), url }).length > 0, url);
  }
  assert.ok(errores({ ...buena(), url: "https://api.ejemplo.eu/v1/a8f3K9x2Lp0Qz7Wm4Nb6/empleos" }).length > 0);
  assert.ok(errores({ ...buena(), mapeo_campos: { ...buena().mapeo_campos, id: "sk-ABCDEF1234567890abcdef1234567890" } }).length > 0);
});

test("no rechaza parámetros legítimos como keywords o fechas", () => {
  const ok = validarFuente({ ...buena(), parametros: { keywords: "datos", desde: "2026-11-05T00:00:00Z", author: "x" } });
  assert.ok(ok.ok);
});

test("LinkedIn e Indeed no se admiten como fuente (regla del producto)", () => {
  for (const url of ["https://www.linkedin.com/jobs", "https://linkedin.com/jobs", "https://es.indeed.com/api", "https://indeed.com./x", "https://uk.indeed.co.uk/x"]) {
    assert.ok(errores({ ...buena(), url }).length > 0, url);
  }
});
