// GET /cuenta/descargar — RGPD, derecho de acceso: la usuaria descarga sus propios datos en JSON, al momento,
// sin dejar ningún archivo en el servidor. Reutiliza SQL_EXPORTAR (nunca incluye el hash de la contraseña).
import { NextResponse } from "next/server";
import { db, conUsuaria } from "@/lib/db";
import { sesionActual } from "@/lib/sesion";
import { SQL_EXPORTAR } from "@/lib/datos-usuaria";
import { registrarEvento } from "@/lib/importar";

export async function GET() {
  const s = await sesionActual();
  if (!s) return NextResponse.redirect(new URL("/entrar", process.env.HORMA_URL || "http://localhost:3000"));
  const t0 = Date.now();
  const id = s.usuaria_id;
  // Con RLS (A3) todo va por una sola conexión con la usuaria fijada: de una en una, no en paralelo.
  const [usuaria, cuenta, perfil, preferencias, matches, candidaturas, enviosEmpresa] = await conUsuaria(id, async (c) => [
    await c.query(SQL_EXPORTAR.usuaria, [id]),
    await c.query(SQL_EXPORTAR.cuenta, [id]),
    await c.query(SQL_EXPORTAR.perfil, [id]),
    await c.query(SQL_EXPORTAR.preferencias, [id]),
    await c.query(SQL_EXPORTAR.matches, [id]),
    await c.query(SQL_EXPORTAR.candidaturas, [id]),
    await c.query(SQL_EXPORTAR.envios_empresa, [id]),
  ]);
  const cuerpo = JSON.stringify({
    exportado_en: new Date().toISOString(),
    usuaria: usuaria.rows[0]?.dato ?? null,
    cuenta: cuenta.rows[0]?.dato ?? null,
    perfil: perfil.rows[0]?.dato ?? null,
    preferencias: preferencias.rows[0]?.dato ?? null,
    matches: matches.rows[0]?.dato ?? [],
    candidaturas: candidaturas.rows[0]?.dato ?? [],
    envios_empresa: enviosEmpresa.rows[0]?.dato ?? [],
  }, null, 2);
  await registrarEvento(db(), { componente: "web-cuenta", accion: "descargar-datos", resultado: "ok", duracion_ms: Date.now() - t0 }).catch(() => {});
  return new NextResponse(cuerpo, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="horma-datos.json"',
      "cache-control": "no-store",
    },
  });
}
