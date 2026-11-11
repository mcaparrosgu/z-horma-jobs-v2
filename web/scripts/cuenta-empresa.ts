// Crea (o actualiza la contraseña de) una cuenta de empresa. Alta solo por terminal (modo piloto, bloque 3):
// sin verificación de correo no se abre el registro público; esta es la única vía.
// Uso (desde web/): npm run cuenta-empresa -- --empresa <id> --nombre "<nombre>" --email <correo>
// También acepta la contraseña por la entrada estándar (para pruebas): echo "…" | npm run cuenta-empresa -- …
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro } from "../src/lib/importar.ts";
import { hashContrasena, normalizarEmail, problemaContrasena } from "../src/lib/auth.ts";
import { ID_EMPRESA } from "../src/lib/empresa-oferta.ts";

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) { console.error(problema); process.exit(1); }

const args = process.argv.slice(2);
const valor = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const id = valor("--empresa");
const nombre = valor("--nombre");
const email = normalizarEmail(valor("--email"));
if (!id || !ID_EMPRESA.test(id) || !nombre || nombre.length > 200 || !email) {
  console.error('Uso: npm run cuenta-empresa -- --empresa <id> --nombre "<nombre>" --email <correo>  (id: minúsculas, números, - _; máximo 80)');
  process.exit(1);
}

/** Lee una línea sin mostrarla (o de la entrada estándar si no es una terminal). Igual que scripts/cuenta.ts. */
function leerSecreto(pregunta: string): Promise<string> {
  return new Promise((res, rej) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) {
      let t = "";
      entrada.setEncoding("utf8");
      entrada.on("data", (d) => { t += d; });
      entrada.on("end", () => res(t.replace(/\r?\n$/, "")));
      entrada.on("error", rej);
      return;
    }
    process.stdout.write(pregunta);
    let t = "";
    entrada.setRawMode(true); entrada.resume(); entrada.setEncoding("utf8");
    const alDato = (c: string) => {
      for (const ch of c) {
        if (ch === "\u0003") { entrada.setRawMode(false); process.stdout.write("\n"); process.exit(130); }
        if (ch === "\r" || ch === "\n") {
          entrada.setRawMode(false); entrada.pause(); entrada.off("data", alDato); process.stdout.write("\n"); return res(t);
        }
        if (ch === "\u007f" || ch === "\b") t = t.slice(0, -1); else t += ch;
      }
    };
    entrada.on("data", alDato);
  });
}

const pw = await leerSecreto("Contraseña (12 caracteres o más; no se ve al escribir): ");
if (process.stdin.isTTY) {
  const otra = await leerSecreto("Repítela: ");
  if (otra !== pw) { console.error("No coinciden."); process.exit(1); }
}
const mal = problemaContrasena(pw, email);
if (mal) { console.error(mal); process.exit(1); }

const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
try {
  await db.connect();
  const hash = await hashContrasena(pw);
  await db.query("BEGIN");
  await db.query(
    "INSERT INTO empresas (id, nombre) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre",
    [id, nombre],
  );
  const r = await db.query(
    `INSERT INTO cuentas_empresa (empresa_id, email, hash) VALUES ($1, $2, $3)
     ON CONFLICT (empresa_id) DO UPDATE SET email = EXCLUDED.email, hash = EXCLUDED.hash, fallos = 0, bloqueada_hasta = NULL
     RETURNING (xmax = 0) AS nueva`,
    [id, email, hash],
  );
  await db.query("DELETE FROM sesiones_empresa WHERE empresa_id = $1", [id]); // cambiar la contraseña cierra las sesiones abiertas
  await db.query("COMMIT");
  console.log(`Cuenta de empresa ${r.rows[0].nueva ? "creada" : "actualizada"} («${nombre}», id ${id}). Ya puede entrar en /empresa/entrar con su correo.`);
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error("No se pudo guardar la cuenta de empresa:", errorSeguro(e));
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
