// Guarda estática del RLS (no necesita base de datos). Tres capas, todas con «prueba de la prueba»:
//  1. Denegar por defecto: solo los archivos de PERMITIDOS pueden llamar a `db()`; un archivo nuevo que lo haga falla
//     hasta que alguien lo añada a la lista a conciencia. Y `db()` solo puede aparecer como `db().query(` o
//     `db().connect(` (nada de `const pool = db()` ni pasarlo como argumento: así no hay alias que esquiven la guarda).
//  2. Las consultas con RLS se DERIVAN del código (toda constante SQL de lib/ que toca una tabla con RLS). Un archivo
//     de la app que use una debe pasar por conUsuaria / conEmpresa / fijarUsuaria, y nunca por `db().query(...)`.
//     Ningún archivo de la app puede escribir SQL propio sobre una tabla con RLS: el SQL vive en lib/.
//  3. La lista de tablas con RLS se compara con las migraciones: una tabla nueva con RLS que no esté aquí hace fallar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const TABLAS_RLS = ["perfiles", "preferencias", "matches", "candidaturas", "envios_empresa"];
const T = TABLAS_RLS.join("|");
/** SQL que toca una tabla con RLS: FROM/JOIN/INTO/UPDATE/TRUNCATE/LOCK, unión con coma, `public.` o comillas. */
const TOCA_TABLA = new RegExp(String.raw`(?:\b(?:FROM|JOIN|INTO|UPDATE|TRUNCATE(?:\s+TABLE)?|LOCK(?:\s+TABLE)?)\s+|\bFROM\s+[^;)]*?,\s*)(?:public\.)?"?(?:${T})\b`, "i");
/** Formas aceptadas de entrar a una tabla con RLS: transacción con la variable de sesión puesta. */
const FIJA_SESION = /\b(?:conUsuaria|conEmpresa|fijarUsuaria)\s*\(/;

/**
 * Archivos que pueden llamar a `db()` directamente. Todos usan el pool solo para tablas SIN RLS (ofertas, fuentes,
 * eventos, cuentas, sesiones…) o para transacciones que fijan la usuaria ellos mismos. Añadir uno exige pensar
 * (y revisar) qué tablas toca. Rutas relativas a src/ con «/».
 */
export const PERMITIDOS = new Set([
  "app/admin/ofertas-empresas/actions.ts", "app/admin/ofertas-empresas/page.tsx", "app/auth/google/callback/route.ts",
  "app/candidatos/actions.ts", "app/candidatos/page.tsx", "app/candidaturas/[id]/actions.ts",
  "app/candidaturas/[id]/enviar/[ofertaId]/actions.ts", "app/cuenta/actions.ts", "app/cuenta/descargar/route.ts",
  "app/cuenta/page.tsx", "app/ejecuciones/page.tsx", "app/empresa/actions.ts", "app/empresa/ofertas/[id]/bandeja/actions.ts",
  "app/empresa/ofertas/[id]/bandeja/page.tsx", "app/empresa/ofertas/[id]/editar/page.tsx", "app/empresa/ofertas/actions.ts",
  "app/empresa/page.tsx", "app/entrar/actions.ts", "app/fuentes/actions.ts", "app/fuentes/page.tsx", "app/ofertas/page.tsx",
  "app/page.tsx", "app/salud/page.tsx", "app/seguimiento/actions.ts", "lib/sesion.ts", "lib/sesion-empresa.ts",
]);

export interface Archivo { ruta: string; texto: string }

/** Nombres exportados (constantes o funciones SQL) cuyo cuerpo toca una tabla con RLS; cierra también las que interpolan a otra. */
export function consultasRls(libs: Archivo[]): Set<string> {
  const cuerpos = new Map<string, string>();
  for (const { texto: bruto } of libs) {
    const texto = sinComentarios(bruto);
    for (const trozo of texto.split(/\n(?=export )/)) {
      const m = /^export (?:const|function|async function) (\w+)/.exec(trozo);
      if (m) cuerpos.set(m[1], trozo);
    }
  }
  const rls = new Set<string>();
  for (const [n, c] of cuerpos) if (TOCA_TABLA.test(c)) rls.add(n);
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const [n, c] of cuerpos) {
      if (rls.has(n)) continue;
      if ([...rls].some((r) => new RegExp(String.raw`\b${r}\b`).test(c))) { rls.add(n); cambio = true; }
    }
  }
  return rls;
}

/** Argumentos (entre paréntesis equilibrados, en varias líneas si hace falta) de cada `db().query(` / `db().connect(`. */
function llamadasSueltas(texto: string): string[] {
  const res: string[] = [];
  const re = /\bdb\(\)\s*\.\s*(?:query|connect)\s*(?:<[^>(]*>)?\(/g;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    let prof = 1, i = re.lastIndex;
    for (; i < texto.length && prof > 0; i++) { if (texto[i] === "(") prof++; else if (texto[i] === ")") prof--; }
    res.push(texto.slice(re.lastIndex, i));
  }
  return res;
}

/** Quita comentarios, para que una frase como «db() sin más» en un comentario no cuente como código. */
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Problemas en los archivos de `src/` (menos lib/db.ts). `consultas` = salida de consultasRls. */
export function problemasRls(archivos: Archivo[], consultas: Set<string>, permitidos: Set<string> = PERMITIDOS): string[] {
  const problemas: string[] = [];
  const palabra = (n: string) => new RegExp(String.raw`\b${n}\b`);
  for (const { ruta, texto: bruto } of archivos) {
    const texto = sinComentarios(bruto);
    const rutaN = ruta.replace(/\\/g, "/");
    const esLib = rutaN.startsWith("lib/");
    // Capa 1: denegar por defecto y sin alias.
    if (/\bdb\(\)/.test(texto)) {
      if (!permitidos.has(rutaN)) problemas.push(`${rutaN}: llama a db() y no está en PERMITIDOS (¿toca tablas con RLS? usa conUsuaria/conEmpresa)`);
      const total = (texto.match(/\bdb\(\)/g) ?? []).length;
      // Formas válidas: db().query( · db().connect( · f(db(), …) con f de lib que solo toca cuentas, sesiones y eventos (sin RLS; si alguna tocara una tabla con RLS, consultasRls la marcaría).
      const buenas = (texto.match(/\bdb\(\)\s*\.\s*(?:query|connect)\s*(?:<[^>(]*>)?\(|\b(?:registrarEvento|cambiarContrasenaPropia|puedeBorrarCuenta|entrarConContrasena|entrarConContrasenaEmpresa|ipBloqueada|anotarFalloIp)\(\s*db\(\)/g) ?? []).length;
      if (total !== buenas) problemas.push(`${rutaN}: usa db() de otra forma que db().query( / db().connect( (alias o paso como argumento)`);
    }
    // Capa 2: nada de db().query con una consulta con RLS, ni SQL propio sobre tablas con RLS fuera de lib/.
    for (const args of llamadasSueltas(texto)) {
      const q = [...consultas].find((n) => palabra(n).test(args));
      if (q) problemas.push(`${rutaN}: db().query con ${q} (tabla con RLS fuera de conUsuaria/conEmpresa)`);
      if (TOCA_TABLA.test(args)) problemas.push(`${rutaN}: SQL en línea sobre una tabla con RLS dentro de db().query`);
    }
    if (!esLib && TOCA_TABLA.test(texto)) problemas.push(`${rutaN}: SQL propio sobre una tabla con RLS; el SQL de esas tablas vive en lib/`);
    if (/\bimport\s*\{[^}]*\bas\b[^}]*\}/.test(texto) && !esLib) {
      // un alias podría esconder el nombre de una consulta con RLS
      for (const n of consultas) if (new RegExp(String.raw`\b${n}\s+as\b`).test(texto)) problemas.push(`${rutaN}: importa ${n} con alias`);
    }
    if (!esLib) {
      const usadas = [...consultas].filter((n) => palabra(n).test(texto.replace(/^import[^;\n]*;?$/gm, "")));
      if (usadas.length && !FIJA_SESION.test(texto)) problemas.push(`${rutaN}: usa ${usadas.join(", ")} sin fijar la usuaria/empresa de la sesión`);
    }
  }
  return problemas;
}

const archivos = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
});
const leer = (rutas: string[], raiz: string): Archivo[] => rutas.map((p) => ({ ruta: relative(raiz, p).replace(/\\/g, "/"), texto: readFileSync(p, "utf8") }));

const RAIZ = join(process.cwd(), "src");
const todos = leer(archivos(RAIZ), RAIZ);
const esLib = (a: Archivo) => a.ruta.startsWith("lib/");
const consultas = consultasRls(todos.filter(esLib));
const codigo = todos.filter((a) => a.ruta !== "lib/db.ts");

test("la lista de consultas con RLS se deriva del código y no queda vacía por un fallo de la expresión", () => {
  for (const conocida of ["SQL_PERFIL", "SQL_PREFERENCIAS", "SQL_MATCHES", "SQL_CANDIDATURAS", "SQL_APROBAR", "SQL_MARCAR_ENVIADA",
    "SQL_REGISTRAR_RESPUESTA", "SQL_ENVIAR_A_EMPRESA", "SQL_RETIRAR_ENVIO", "SQL_BANDEJA", "SQL_CAMBIAR_ESTADO_BANDEJA", "SQL_EXPORTAR", "sqlPreferencias"]) {
    assert.ok(consultas.has(conocida), `${conocida} debería detectarse como consulta con RLS`);
  }
  for (const libre of ["SQL_OFERTAS_EMPRESA", "SQL_PANEL_TOTALES", "SQL_FUENTES", "SQL_MIGRACIONES"]) assert.ok(!consultas.has(libre), libre);
});

test("la lista de tablas con RLS de la guarda coincide con las migraciones", () => {
  const dir = join(process.cwd(), "db", "migraciones");
  const enMigraciones = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/ALTER TABLE\s+(?:public\.)?"?(\w+)"?\s+ENABLE ROW LEVEL SECURITY/gi)) enMigraciones.add(m[1]);
  }
  assert.ok(enMigraciones.size > 0, "no se leyó ninguna migración con RLS: la expresión falló");
  assert.deepEqual([...enMigraciones].sort(), [...TABLAS_RLS].sort(), "una tabla con RLS nueva debe añadirse a TABLAS_RLS (y a la guarda)");
});

test("solo los archivos permitidos llaman a db(); las consultas con RLS van por conUsuaria/conEmpresa", () => {
  assert.deepEqual(problemasRls(codigo, consultas), []);
});

test("la guarda detecta código malo (prueba de la prueba)", () => {
  const q = new Set(["SQL_PERFIL", "SQL_MATCHES"]);
  const permitidos = new Set(["app/ok.ts"]);
  const malos: Archivo[] = [
    { ruta: "app/uno.ts", texto: "const r = await db().query(SQL_PERFIL, [id]);" },
    { ruta: "app/dos.ts", texto: "const r = await db()\n  .query<Fila>(\n    SQL_MATCHES,\n    [id],\n  );" },
    { ruta: "app/tres.ts", texto: 'import { SQL_MATCHES } from "@/lib/matches";\nconst r = await pool.query(SQL_MATCHES, [id]);' },
    { ruta: "app/nuevo.ts", texto: 'const r = await db().query("SELECT 1 FROM ofertas");' }, // archivo no permitido
    { ruta: "app/ok.ts", texto: "const pool = db();\nawait pool.query(SQL_PERFIL, [id]);" }, // alias
    { ruta: "app/ok.ts", texto: "f(db());" }, // db() pasado como argumento
    { ruta: "app/ok.ts", texto: 'await db().query("SELECT * FROM perfiles");' }, // SQL propio
    { ruta: "app/ok.ts", texto: 'const s = `SELECT 1 FROM ofertas o, "perfiles" p`;' }, // unión con coma y comillas
    { ruta: "app/ok.ts", texto: 'const s = "SELECT * FROM public.matches";' },
    { ruta: "app/ok.ts", texto: 'import { SQL_MATCHES as M } from "@/lib/matches";\nawait conUsuaria(id, (c) => c.query(M));' },
  ];
  for (const m of malos) assert.ok(problemasRls([m], q, permitidos).length > 0, `${m.ruta}: ${m.texto.slice(0, 50)}`);
  const buenos: Archivo[] = [
    { ruta: "app/ok.ts", texto: 'const r = await conUsuaria(id, (c) => c.query(SQL_PERFIL, [id]));' },
    { ruta: "app/ok.ts", texto: 'const o = await db().query("SELECT 1 FROM ofertas");\nawait conUsuaria(id, (c) => c.query(SQL_MATCHES, [id]));' },
    { ruta: "app/ok.ts", texto: 'import { SQL_PERFIL } from "@/lib/x";\nexport const nada = db().query("SELECT 1");' },
    { ruta: "app/ok.ts", texto: "// db() sin más, en un comentario\nconst x = 1; await db().query('SELECT 2');" },
  ];
  for (const b of buenos) assert.deepEqual(problemasRls([b], q, permitidos), [], `${b.ruta}: ${b.texto.slice(0, 50)}`);
});

test("la lista PERMITIDOS no guarda archivos que ya no llaman a db()", () => {
  const llaman = new Set(codigo.filter((a) => /\bdb\(\)/.test(sinComentarios(a.texto))).map((a) => a.ruta));
  const sobran = [...PERMITIDOS].filter((p) => !llaman.has(p));
  assert.deepEqual(sobran, []);
});

test("consultasRls sigue las constantes que interpolan a otra con RLS", () => {
  const libs: Archivo[] = [{ ruta: "lib/x.ts", texto: "export const A = `SELECT * FROM matches WHERE x`;\nexport const B = `${A} ORDER BY y`;\nexport const C = `SELECT 1 FROM ofertas`;" }];
  assert.deepEqual([...consultasRls(libs)].sort(), ["A", "B"]);
});
