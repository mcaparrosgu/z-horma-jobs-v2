import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { inicioDe, requerirSesion } from "@/lib/sesion";
import {
  FLUJOS, SQL_PANEL_FUENTES, SQL_PANEL_POR_FUENTE, SQL_PANEL_POR_PAIS, SQL_PANEL_POR_LICENCIA, SQL_PANEL_TOTALES,
  anchoBarra, estadoEjecucion, type Conteo,
} from "@/lib/panel";

type FilaFuente = {
  nombre: string; activa: boolean; licencia: string | null; adaptador: string | null;
  ultima_inicio: Date | null; ultima_fin: Date | null; ultima_entraron: number | null;
  ultima_descartadas: number | null; ultima_errores: number | null;
};

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando panel…</p>}><Panel /></Suspense>;
}

const fecha = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16);

function Barras({ titulo, filas }: { titulo: string; filas: Conteo[] }) {
  const max = Math.max(0, ...filas.map((f) => f.n));
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">{titulo}</h3>
      {filas.length === 0 ? <p className="text-sm text-zinc-600">Sin datos todavía.</p> : (
        <ul className="space-y-1 text-sm">
          {filas.map((f) => (
            <li key={f.clave}>
              <div className="flex justify-between gap-2"><span className="break-all">{f.clave}</span><span>{f.n}</span></div>
              <div className="h-1.5 rounded bg-zinc-200"><div className="h-1.5 rounded bg-zinc-700" style={{ width: `${anchoBarra(f.n, max)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function Panel() {
  const sesion = await requerirSesion();
  if (sesion.rol !== "admin") redirect(inicioDe(sesion)); // cada usuaria va a lo suyo; el panel es de administración
  const [fuentes, porFuente, porPais, porLicencia, totales] = await Promise.all([
    db().query<FilaFuente>(SQL_PANEL_FUENTES),
    db().query<Conteo>(SQL_PANEL_POR_FUENTE),
    db().query<Conteo>(SQL_PANEL_POR_PAIS),
    db().query<Conteo>(SQL_PANEL_POR_LICENCIA),
    db().query<{ ofertas: number; usuarias: number }>(SQL_PANEL_TOTALES),
  ]);
  const t = totales.rows[0];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Panel</h1>
        <p className="text-sm text-zinc-600">Solo lectura: enseña el estado y qué comando lanzar en Claude Code. Desde aquí no se ejecuta nada.</p>
      </div>

      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-medium">Pipelines</h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead><tr className="border-b border-zinc-300"><th className="p-2">Flujo</th><th className="p-2">Comando</th><th className="p-2">Qué hace</th></tr></thead>
          <tbody>
            {FLUJOS.map((f) => (
              <tr key={f.letra} className="border-b border-zinc-200 align-top">
                <td className="p-2 whitespace-nowrap">{f.letra} · {f.nombre}</td>
                <td className="p-2"><code>{f.comando}</code></td>
                <td className="p-2">{f.hace}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-medium">Ingesta</h2>
        {fuentes.rows.length === 0 ? (
          <p className="text-sm text-zinc-600">Ninguna fuente registrada todavía. Se crean al correr <code>npm run importar</code> con ofertas de una fuente de <code>endpoints.json</code>.</p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="border-b border-zinc-300">
              <th className="p-2">Fuente</th><th className="p-2">Estado</th><th className="p-2">Licencia</th><th className="p-2">Última ejecución</th><th className="p-2">Resultado</th>
            </tr></thead>
            <tbody>
              {fuentes.rows.map((f) => (
                <tr key={f.nombre} className="border-b border-zinc-200 align-top">
                  <td className="p-2">{f.nombre}</td>
                  <td className="p-2">{f.activa ? "activa" : "apagada"}</td>
                  <td className="p-2">{f.licencia ?? "sin indicar"}</td>
                  <td className="p-2">{f.ultima_inicio ? fecha(f.ultima_inicio) : "—"}</td>
                  <td className="p-2">{estadoEjecucion(f)}{f.ultima_inicio ? ` · ${f.ultima_entraron} entraron, ${f.ultima_descartadas} descartadas` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-sm text-zinc-600">Para traer ofertas: <code>/ingestar-ofertas</code> en Claude Code y después <code>npm run importar</code>. El detalle está en Ejecuciones.</p>
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-medium">Datos guardados</h2>
        <p className="mb-3 text-sm">{t.ofertas} ofertas · {t.usuarias} usuarias registradas</p>
        <div className="grid gap-6 md:grid-cols-3">
          <Barras titulo="Ofertas por fuente" filas={porFuente.rows} />
          <Barras titulo="Ofertas por país" filas={porPais.rows} />
          <Barras titulo="Ofertas por licencia" filas={porLicencia.rows} />
        </div>
      </section>
    </div>
  );
}
