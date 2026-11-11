import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db, conEmpresa } from "@/lib/db";
import { requerirSesionEmpresa } from "@/lib/sesion-empresa";
import { SQL_BANDEJA, SQL_OFERTA_TITULO, ESTADOS_BANDEJA } from "@/lib/empresa-envio";
import { cambiarEstadoBandeja } from "./actions";

type FilaEnvio = {
  id: number; cv_md: string; carta_md: string | null; contacto_nombre: string | null; contacto_email: string | null;
  estado_bandeja: string; enviado_en: Date;
};

const ETIQUETA: Record<string, string> = { recibida: "recibida", vista: "vista", en_proceso: "en proceso", no_seleccionada: "no seleccionada" };

export default function Pagina({ params }: PageProps<"/empresa/ofertas/[id]/bandeja">) {
  return <Suspense fallback={<p className="text-sm">Cargando…</p>}><Bandeja params={params} /></Suspense>;
}

async function Bandeja({ params }: { params: PageProps<"/empresa/ofertas/[id]/bandeja">["params"] }) {
  const { id } = await params;
  const s = await requerirSesionEmpresa();
  const oferta = (await db().query<{ titulo: string; empresa_id: string | null }>(SQL_OFERTA_TITULO, [id])).rows[0];
  if (!oferta || oferta.empresa_id !== s.empresa_id) notFound();
  const filas = (await conEmpresa(s.empresa_id, (c) => c.query<FilaEnvio>(SQL_BANDEJA, [id, s.empresa_id]))).rows;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Candidaturas recibidas: {oferta.titulo}</h1>
        <p className="text-sm text-zinc-600">En orden de llegada. Horma no las ordena, filtra ni puntúa por ti: decides tú, leyéndolas.</p>
      </div>

      {filas.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm">Todavía no ha llegado ninguna.</p>
      ) : (
        <ul className="space-y-3">
          {filas.map((e) => (
            <li key={e.id} className="space-y-2 rounded border border-zinc-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-zinc-600">Recibida el {new Date(e.enviado_en).toISOString().slice(0, 10)}</p>
                <form action={cambiarEstadoBandeja} className="flex items-center gap-2">
                  <input type="hidden" name="envio_id" value={e.id} />
                  <input type="hidden" name="oferta_id" value={id} />
                  <select name="estado" defaultValue={e.estado_bandeja} className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs">
                    {ESTADOS_BANDEJA.map((v) => <option key={v} value={v}>{ETIQUETA[v]}</option>)}
                  </select>
                  <button className="rounded bg-zinc-900 px-2 py-1 text-xs text-white">Guardar</button>
                </form>
              </div>
              {e.contacto_nombre && <p>Contacto: {e.contacto_nombre}{e.contacto_email ? ` · ${e.contacto_email}` : ""}</p>}
              <details>
                <summary className="cursor-pointer text-xs underline">CV</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{e.cv_md}</pre>
              </details>
              {e.carta_md && (
                <details>
                  <summary className="cursor-pointer text-xs underline">Carta de presentación</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{e.carta_md}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
