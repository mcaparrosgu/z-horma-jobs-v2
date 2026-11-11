// Exporta los datos de una EMPRESA (RGPD: derecho de acceso y portabilidad). Solo lee.
// Uso (desde web/): npm run exportar-empresa -- --empresa <id>
// Crea datos/exportaciones/empresa-<id>-<fecha>/base-de-datos.json. Lleva el correo de la cuenta: se entrega y se borra.
// NO incluye el contenido de las candidaturas recibidas (CV, carta, contacto de candidatas): son datos de terceras personas.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro } from "../src/lib/importar.ts";
import { idEmpresaValido, SQL_EXPORTAR_EMPRESA } from "../src/lib/datos-empresa.ts";

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) { console.error(problema); process.exit(1); }

const args = process.argv.slice(2);
const k = args.indexOf("--empresa");
const id = k >= 0 ? args[k + 1] : undefined;
if (!idEmpresaValido(id)) {
  console.error("Uso: npm run exportar-empresa -- --empresa <id>  (id: minúsculas, números, - _ ; máximo 80)");
  process.exit(1);
}

const DATOS = resolve(import.meta.dirname, "..", "..", "datos");
const destino = join(DATOS, "exportaciones", `empresa-${id}-${new Date().toISOString().slice(0, 10)}`);
if (existsSync(destino)) {
  console.error("Ya existe una exportación de hoy para esa empresa: bórrala o muévela antes de repetir.");
  process.exit(1);
}

const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
try {
  await db.connect();
  const empresa = await db.query(SQL_EXPORTAR_EMPRESA.empresa, [id]);
  if (!empresa.rowCount) { console.error("No hay ninguna empresa con ese id. No se crea nada."); process.exit(1); }
  const cuenta = await db.query(SQL_EXPORTAR_EMPRESA.cuenta, [id]);
  const ofertas = await db.query(SQL_EXPORTAR_EMPRESA.ofertas, [id]);
  const recibidas = await db.query(SQL_EXPORTAR_EMPRESA.candidaturas_recibidas, [id]);
  try {
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, "base-de-datos.json"), JSON.stringify({
      exportado_en: new Date().toISOString(),
      nota: "No incluye el contenido de las candidaturas recibidas (CV, carta y contacto de candidatas): son datos de terceras personas.",
      empresa: empresa.rows[0].dato,
      cuenta: cuenta.rows[0]?.dato ?? null,
      ofertas: ofertas.rows[0]?.dato ?? [],
      candidaturas_recibidas: recibidas.rows[0]?.dato ?? [],
    }, null, 2), "utf8");
  } catch (e) {
    rmSync(destino, { recursive: true, force: true }); // nunca queda una exportación a medias
    throw e;
  }
  console.log("Exportación creada en datos/exportaciones/ (carpeta «empresa-<id>-<fecha>»).");
  console.log(`Ofertas: ${ofertas.rows[0]?.dato?.length ?? 0} · candidaturas recibidas (solo estado): ${recibidas.rows[0]?.dato?.length ?? 0}`);
  console.log("Lleva el correo de la cuenta: entrégala a la empresa y bórrala después. No se sube a git.");
} catch (e) {
  console.error("Falló la exportación:", (e as { code?: unknown })?.code ? errorSeguro(e) : (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
