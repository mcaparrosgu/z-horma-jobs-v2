import { Suspense } from "react";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/sesion";
import { SQL_EJECUCIONES } from "@/lib/consultas";

type Ejecucion = { id: string; fuente: string; inicio: Date; fin: Date | null; entraron: number; descartadas: number; errores: unknown[] };

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando ejecuciones…</p>}><Ejecuciones /></Suspense>;
}

async function Ejecuciones() {
  await requerirAdmin(); // sección de administración: el proxy solo mira que haya cookie
  const { rows } = await db().query<Ejecucion>(SQL_EJECUCIONES);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ejecuciones de ingesta</h1>
      <p className="text-sm text-zinc-600">Una fila por cada vez que se trae un portal. Se muestran las 50 últimas.</p>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm">Todavía no se ha ejecutado ninguna ingesta.</p>
      ) : (
        <table className="w-full border-collapse bg-white text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="p-2">Fuente</th><th className="p-2">Inicio</th><th className="p-2">Duración</th>
              <th className="p-2">Entraron</th><th className="p-2">Descartadas</th><th className="p-2">Errores</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-zinc-200 align-top">
                <td className="p-2">{c.fuente}</td>
                <td className="p-2">{c.inicio.toISOString().replace("T", " ").slice(0, 16)}</td>
                <td className="p-2">{c.fin ? `${Math.round((c.fin.getTime() - c.inicio.getTime()) / 1000)} s` : "sin terminar"}</td>
                <td className="p-2">{c.entraron}</td>
                <td className="p-2">{c.descartadas}</td>
                <td className="p-2">{c.errores.length === 0 ? "ninguno" : c.errores.map((e, i) => <div key={i}>{String(e).slice(0, 200)}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
