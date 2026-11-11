// Borra TODOS los datos de una usuaria (RGPD: derecho de supresión). IRREVERSIBLE.
// Uso (desde web/): npm run borrar -- --usuaria <id>                    (en seco: solo enseña qué se perdería)
//                   npm run borrar -- --usuaria <id> --confirmar <id>   (borra de verdad; repite el id)
// Borra: su fila en la base (y, en cascada, cuenta de acceso, sesiones, perfil, preferencias, recomendaciones, candidaturas y envíos a empresas) y sus carpetas en datos/usuarias,
// datos/candidaturas y datos/matches. NO toca ofertas, fuentes ni eventos (no llevan datos personales)
// ni las exportaciones ya hechas (datos/exportaciones): esas bórralas tú cuando las entregues.
import { resolve } from "node:path";
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { errorSeguro } from "../src/lib/importar.ts";
import { idValido, SQL_BORRAR_USUARIA, SQL_EXPORTAR, aCuarentena, restaurar, purgarCuarentena, inspeccionar } from "../src/lib/datos-usuaria.ts";

const problema = problemaClave(process.env.HORMA_DB_PASSWORD);
if (problema) { console.error(problema); process.exit(1); }

const args = process.argv.slice(2);
const valor = (flag: string) => { const k = args.indexOf(flag); return k >= 0 ? args[k + 1] : undefined; };
const id = valor("--usuaria"), confirmar = valor("--confirmar");
if (!id || !idValido(id)) {
  console.error("Uso: npm run borrar -- --usuaria <id> [--confirmar <id>]");
  process.exit(1);
}
if (args.includes("--confirmar") && confirmar !== id) {
  console.error("--confirmar debe repetir exactamente el id de la usuaria. No se borra nada.");
  process.exit(1);
}

const DATOS = resolve(import.meta.dirname, "..", "..", "datos");
const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password: process.env.HORMA_DB_PASSWORD });
try {
  await db.connect();
  const usuaria = await db.query(SQL_EXPORTAR.usuaria, [id]);
  const perfil = await db.query(SQL_EXPORTAR.perfil, [id]);
  const preferencias = await db.query(SQL_EXPORTAR.preferencias, [id]);
  const cuenta = await db.query("SELECT (SELECT count(*) FROM cuentas WHERE usuaria_id = $1)::int AS cuentas, (SELECT count(*) FROM sesiones WHERE usuaria_id = $1)::int AS sesiones, (SELECT count(*) FROM matches WHERE usuaria_id = $1)::int AS matches, (SELECT count(*) FROM candidaturas WHERE usuaria_id = $1)::int AS candidaturas, (SELECT count(*) FROM envios_empresa WHERE usuaria_id = $1)::int AS envios", [id]);
  // «Ana» y «ana» son la misma carpeta en Windows: si la base tiene dos ids que solo difieren en mayúsculas, no se toca nada.
  const choque = await db.query("SELECT count(*)::int AS n FROM usuarias WHERE lower(id) = lower($1)", [id]);
  if (choque.rows[0].n > 1) throw new Error("hay ids que solo se distinguen por mayúsculas: resuélvelo a mano");
  const carpetas = inspeccionar(DATOS, id); // aborta si hay enlaces simbólicos
  console.log(`${confirmar ? "SE BORRARÁ" : "EN SECO. Se borraría"}:`);
  console.log(`  base de datos: usuaria ${usuaria.rowCount ? 1 : 0} · perfil ${perfil.rowCount ?? 0} · preferencias ${preferencias.rowCount ?? 0}`);
  const n = cuenta.rows[0];
  console.log(`  también: cuenta de acceso ${n.cuentas} · sesiones abiertas ${n.sesiones} · recomendaciones ${n.matches} · candidaturas ${n.candidaturas} · envíos a empresas ${n.envios}`);
  for (const c of carpetas) console.log(`  disco: datos/${c.carpeta}/(usuaria): ${c.archivos} archivos, ${c.bytes} bytes`);
  if (!usuaria.rowCount && carpetas.length === 0) { console.log("No hay nada de esa usuaria."); }
  else if (!confirmar) {
    console.log("No se ha borrado nada. ¿Has exportado sus datos antes? (npm run exportar). Para borrar de verdad: repite la orden con --confirmar <id>.");
  } else {
    let enCuarentena = false;
    await db.query("BEGIN");
    try {
      const filas = (await db.query(SQL_BORRAR_USUARIA, [id])).rowCount ?? 0;
      const archivos = aCuarentena(DATOS, id); // mover es casi instantáneo y se puede deshacer
      enCuarentena = true;
      await db.query("COMMIT");
      purgarCuarentena(DATOS, id);
      console.log(`Borrado: ${filas} usuaria en la base (con su perfil y preferencias) y ${archivos} archivos en disco.`);
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      if (enCuarentena) restaurar(DATOS, id); // si falló el COMMIT, el disco vuelve a su sitio
      throw e;
    }
  }
} catch (e) {
  console.error("Falló el borrado:", (e as { code?: unknown })?.code ? errorSeguro(e) : (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
