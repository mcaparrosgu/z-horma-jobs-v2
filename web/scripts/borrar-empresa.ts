// Borra los datos de una EMPRESA (RGPD: derecho de supresión). IRREVERSIBLE.
// Uso (desde web/): npm run borrar-empresa -- --empresa <id>                    (en seco: solo enseña qué se perdería)
//                   npm run borrar-empresa -- --empresa <id> --confirmar <id>   (borra de verdad; repite el id)
// Borra: cuenta de acceso, sesiones, candidaturas recibidas y las ofertas que ninguna candidata usó.
// CONSERVA, cerradas y sin el nombre de la empresa ni la descripción, las ofertas con candidaturas o recomendaciones de
// candidatas (si no, se borrarían datos de ellas por el ON DELETE CASCADE). Ver src/lib/datos-empresa.ts.
// NO toca las exportaciones ya hechas (datos/exportaciones): bórralas tú cuando las entregues.
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro } from "../src/lib/importar.ts";
import { idEmpresaValido, SQL_RESUMEN, SQL_BORRAR_EMPRESA, NOMBRE_BAJA } from "../src/lib/datos-empresa.ts";

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) { console.error(problema); process.exit(1); }

const args = process.argv.slice(2);
const valor = (flag: string) => { const k = args.indexOf(flag); return k >= 0 ? args[k + 1] : undefined; };
const id = valor("--empresa"), confirmar = valor("--confirmar");
if (!idEmpresaValido(id)) {
  console.error("Uso: npm run borrar-empresa -- --empresa <id> [--confirmar <id>]");
  process.exit(1);
}
if (args.includes("--confirmar") && confirmar !== id) {
  console.error("--confirmar debe repetir exactamente el id de la empresa. No se borra nada.");
  process.exit(1);
}

const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
try {
  await db.connect();
  const n = (await db.query(SQL_RESUMEN, [id])).rows[0];
  console.log(`${confirmar ? "SE BORRARÁ" : "EN SECO. Se borraría"}:`);
  console.log(`  empresa ${n.empresas} · cuenta de acceso ${n.cuentas} · sesiones abiertas ${n.sesiones} · candidaturas recibidas ${n.candidaturas_recibidas}`);
  console.log(`  ofertas: ${n.ofertas - n.ofertas_conservadas} se borran · ${n.ofertas_conservadas} se conservan cerradas y sin nombre de empresa (tienen candidaturas o recomendaciones de candidatas)`);
  if (!n.empresas) { console.log("No hay ninguna empresa con ese id."); }
  else if (!confirmar) {
    console.log("No se ha borrado nada. ¿Has exportado sus datos antes? (npm run exportar-empresa). Para borrar de verdad: repite la orden con --confirmar <id>.");
  } else {
    await db.query("BEGIN");
    try {
      const filas: number[] = [];
      for (const sql of SQL_BORRAR_EMPRESA) filas.push((await db.query(sql, sql.includes("$2") ? [id, NOMBRE_BAJA] : [id])).rowCount ?? 0);
      await db.query("COMMIT");
      console.log(`Borrado: ${filas[0]} candidaturas recibidas, ${filas[1]} ofertas, ${filas[2]} ofertas conservadas y anonimizadas, ${filas[3]} empresa (con su cuenta y sesiones).`);
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }
} catch (e) {
  console.error("Falló el borrado:", (e as { code?: unknown })?.code ? errorSeguro(e) : (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
