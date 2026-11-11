// Crea (o restablece) la cuenta de una usuaria que ya existe en la base. Es la ÚNICA vía para crear una cuenta de administración:
// la web no puede fijar el rol (migración 014). La contraseña se pide aquí, oculta, y nunca va en la línea de comandos.
// Uso (desde web/): npm run cuenta -- --usuaria <id> --email <correo> [--admin]
// También acepta la contraseña por la entrada estándar (para pruebas): echo "…" | npm run cuenta -- …
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro } from "../src/lib/importar.ts";
import { hashContrasena, normalizarEmail, problemaContrasena } from "../src/lib/auth.ts";
import { idValido } from "../src/lib/datos-usuaria.ts";

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) { console.error(problema); process.exit(1); }

const args = process.argv.slice(2);
const valor = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const id = valor("--usuaria");
const email = normalizarEmail(valor("--email"));
const admin = args.includes("--admin");
if (!id || !idValido(id) || !email) {
  console.error("Uso: npm run cuenta -- --usuaria <id> --email <correo> [--admin]");
  process.exit(1);
}

/** Lee una línea sin mostrarla (o de la entrada estándar si no es una terminal). */
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
  const u = await db.query("SELECT 1 FROM usuarias WHERE id = $1", [id]);
  if (u.rowCount === 0) { console.error("Esa usuaria no existe en la base (impórtala antes con npm run importar)."); process.exit(1); }
  const hash = await hashContrasena(pw);
  const rol = admin ? "admin" : "usuaria";
  // El correo de una cuenta creada desde aquí se da por verificado: lo ha escrito la administradora en su terminal.
  const r = await db.query(
    `INSERT INTO cuentas (usuaria_id, email, hash, email_verificado, rol) VALUES ($1, $2, $3, true, $4)
     ON CONFLICT (usuaria_id) DO UPDATE SET email = EXCLUDED.email, hash = EXCLUDED.hash, email_verificado = true,
       rol = EXCLUDED.rol, fallos = 0, bloqueada_hasta = NULL
     RETURNING (xmax = 0) AS nueva`,
    [id, email, hash, rol],
  );
  await db.query("DELETE FROM sesiones WHERE usuaria_id = $1", [id]); // cambiar la contraseña cierra las sesiones abiertas
  console.log(`Cuenta ${r.rows[0].nueva ? "creada" : "actualizada"} (rol: ${rol}). Ya puede entrar en la web con su correo.`);
} catch (e) {
  console.error("No se pudo guardar la cuenta:", errorSeguro(e));
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
