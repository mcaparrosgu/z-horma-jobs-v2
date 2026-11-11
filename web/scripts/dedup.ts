// Calcula url_canonica, huella, huella_base y grupo_dedup de las ofertas que ya estaban en la base (A1).
// NO toca primera_vista, ultima_vista ni veces_vista (re-importar sí las cuenta; esto no) y no borra ninguna fila.
// Uso (desde web/): npm run dedup            (en seco: solo cuenta)
//                   npm run dedup -- --aplicar
import pg from "pg";
import { problemaClave } from "../src/lib/clave.ts";
import { huellas, urlCanonica } from "../src/lib/calidad-ofertas.ts";

const password = process.env.HORMA_DB_PASSWORD;
const problema = problemaClave(password);
if (problema) { console.error(problema); process.exit(1); }
const aplicar = process.argv.includes("--aplicar");

const client = new pg.Client({ host: "127.0.0.1", port: 5433, user: "horma", database: "horma", password });
await client.connect();
try {
  const { rows } = await client.query(`SELECT id, url, empresa, titulo, ubicacion, fecha::text AS fecha FROM ofertas ORDER BY id`);
  let cambian = 0;
  await client.query("BEGIN");
  for (const o of rows) {
    const h = huellas(o);
    const r = await client.query(
      `UPDATE ofertas SET url_canonica=$2, huella_base=$3, huella=$4, grupo_dedup=$4
       WHERE id=$1 AND (url_canonica IS DISTINCT FROM $2 OR huella_base IS DISTINCT FROM $3 OR huella IS DISTINCT FROM $4 OR grupo_dedup IS DISTINCT FROM $4)`,
      [o.id, urlCanonica(o.url), h.huellaBase, h.huella],
    );
    cambian += r.rowCount ?? 0;
  }
  await client.query(aplicar ? "COMMIT" : "ROLLBACK");
  console.log(`${rows.length} ofertas revisadas; ${cambian} ${aplicar ? "actualizadas" : "se actualizarían (en seco: usa --aplicar)"}.`);
} finally {
  await client.end();
}
