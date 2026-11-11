import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requerirSesionEmpresa } from "@/lib/sesion-empresa";
import { SQL_OFERTAS_EMPRESA, ETIQUETA_PUBLICACION } from "@/lib/empresa-oferta";
import { cerrarOferta } from "./ofertas/actions";

type Fila = { id: string; titulo: string; ubicacion: string; estado_publicacion: string; creada_en: Date; motivo_rechazo: string | null };

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando…</p>}><Panel /></Suspense>;
}

async function Panel() {
  const s = await requerirSesionEmpresa();
  const filas = (await db().query<Fila>(SQL_OFERTAS_EMPRESA, [s.empresa_id])).rows;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Mis ofertas</h1>
        <Link href="/empresa/ofertas/nueva" className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white">Publicar oferta</Link>
      </div>

      {filas.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm">Todavía no has publicado ninguna oferta.</p>
      ) : (
        <ul className="space-y-2">
          {filas.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 bg-white p-3 text-sm">
              <div>
                <p className="font-medium">{o.titulo}</p>
                <p className="text-zinc-600">{o.ubicacion} · {ETIQUETA_PUBLICACION[o.estado_publicacion] ?? o.estado_publicacion} · creada el {new Date(o.creada_en).toISOString().slice(0, 10)}</p>
                {o.estado_publicacion === "rechazada" && o.motivo_rechazo && <p className="mt-1 text-xs text-red-800">Motivo del rechazo: {o.motivo_rechazo}. Edítala y volverá a revisión.</p>}
              </div>
              <div className="flex items-center gap-3">
                {o.estado_publicacion !== "cerrada" && <Link href={`/empresa/ofertas/${o.id}/editar`} className="underline">Editar</Link>}
                {(o.estado_publicacion === "aprobada" || o.estado_publicacion === "cerrada") && (
                  <Link href={`/empresa/ofertas/${o.id}/bandeja`} className="underline">Candidaturas recibidas</Link>
                )}
                {o.estado_publicacion === "aprobada" && (
                  <form action={cerrarOferta}>
                    <input type="hidden" name="oferta_id" value={o.id} />
                    <button className="underline">Cerrar</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
