import { Suspense } from "react";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/sesion";
import { SQL_OFERTAS_PENDIENTES, SQL_OFERTAS_APROBADAS_EMPRESA } from "@/lib/empresa-oferta";
import { moderarOferta, retirarOferta } from "./actions";

type Fila = {
  version: string; id: string; titulo: string; descripcion: string | null; ubicacion: string; remoto: string; contrato: string;
  nivel: string; instrucciones: string[] | null; requisitos: string[]; avisos: { tipo: string; texto: string }[]; creada_en: Date; empresa_nombre: string;
};

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando…</p>}><Moderacion /></Suspense>;
}

async function Moderacion() {
  await requerirAdmin();
  const filas = (await db().query<Fila>(SQL_OFERTAS_PENDIENTES)).rows;
  const aprobadas = (await db().query<{ id: string; titulo: string; empresa_nombre: string }>(SQL_OFERTAS_APROBADAS_EMPRESA)).rows;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Ofertas de empresas pendientes de revisión</h1>
        <p className="text-sm text-zinc-600">Ninguna aparece en «Ofertas» hasta aprobarla aquí: es la defensa contra ofertas falsas o estafas.</p>
      </div>

      {filas.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm">No hay ninguna pendiente.</p>
      ) : (
        <ul className="space-y-3">
          {filas.map((o) => (
            <li key={o.id} className="space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{o.titulo} <span className="font-normal text-zinc-600">· {o.empresa_nombre}</span></h2>
                <span className="text-xs text-zinc-500">enviada el {new Date(o.creada_en).toISOString().slice(0, 10)}</span>
              </div>
              {(o.instrucciones ?? []).length > 0 && (
                <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">
                  <p className="font-medium">Posible texto dirigido a una IA (revísalo antes de aprobar)</p>
                  <ul className="list-disc pl-5">{(o.instrucciones ?? []).map((x, i) => <li key={i}>«{x}»</li>)}</ul>
                </div>
              )}
              <p className="text-zinc-700">{o.ubicacion} · {o.remoto} · {o.contrato} · {o.nivel}</p>
              {o.descripcion && <p className="whitespace-pre-wrap text-zinc-700">{o.descripcion}</p>}
              {o.requisitos.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-zinc-600">{o.requisitos.map((req, i) => <li key={i}>{req}</li>)}</ul>
              )}
              {o.avisos.length > 0 && (
                <ul className="space-y-1">{o.avisos.map((a, i) => <li key={i} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Aviso ({a.tipo}): {a.texto}</li>)}</ul>
              )}
              <div className="flex gap-3">
                <form action={moderarOferta}>
                  <input type="hidden" name="oferta_id" value={o.id} />
                  <input type="hidden" name="version" value={o.version} />
                  <input type="hidden" name="estado" value="aprobada" />
                  <button className="rounded bg-green-700 px-3 py-1.5 text-xs font-medium text-white">Aprobar</button>
                </form>
                <form action={moderarOferta} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="oferta_id" value={o.id} />
                  <input type="hidden" name="version" value={o.version} />
                  <input type="hidden" name="estado" value="rechazada" />
                  <input name="motivo" required maxLength={500} placeholder="Motivo (lo verá la empresa; sin datos personales)" aria-label="Motivo del rechazo" className="w-64 rounded border border-zinc-300 px-2 py-1 text-xs" />
                  <button className="rounded bg-red-700 px-3 py-1.5 text-xs font-medium text-white">Rechazar</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Ofertas de empresas ya publicadas</h2>
        <p className="text-sm text-zinc-600">Si una se cuela y resulta sospechosa, «Retirar» la cierra y deja de aparecer en «Ofertas» (y no admite más envíos).</p>
        {aprobadas.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay ninguna publicada.</p>
        ) : (
          <ul className="space-y-1">
            {aprobadas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-3 py-2 text-sm">
                <span>{a.titulo} <span className="text-zinc-600">· {a.empresa_nombre}</span></span>
                <form action={retirarOferta}>
                  <input type="hidden" name="oferta_id" value={a.id} />
                  <button className="rounded bg-red-700 px-3 py-1 text-xs font-medium text-white">Retirar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
