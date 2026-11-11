import { Suspense } from "react";
import { notFound } from "next/navigation";
import { conUsuaria } from "@/lib/db";
import { requerirDuena } from "@/lib/sesion";
import { ID_OFERTA } from "@/lib/candidaturas";
import { SQL_CANDIDATURA_PARA_ENVIAR, modoDeEnvio } from "@/lib/empresa-envio";
import { FormularioEnviar } from "./formulario";

type Fila = { cv_md: string; carta_md: string | null; estado: string; historial: { estado: string; canal?: string | null }[]; envio_vivo: boolean; empresa_id: string | null; titulo: string; empresa_nombre: string };

export default function Pagina({ params }: PageProps<"/candidaturas/[id]/enviar/[ofertaId]">) {
  return <Suspense fallback={<p className="text-sm">Cargando…</p>}><Enviar params={params} /></Suspense>;
}

async function Enviar({ params }: { params: PageProps<"/candidaturas/[id]/enviar/[ofertaId]">["params"] }) {
  const { id, ofertaId } = await params;
  if (!ID_OFERTA.test(ofertaId)) notFound();
  const s = await requerirDuena(id);
  const r = await conUsuaria(s.usuaria_id, (c) => c.query<Fila>(SQL_CANDIDATURA_PARA_ENVIAR, [s.usuaria_id, ofertaId]));
  const c = r.rows[0];
  if (!c || !modoDeEnvio(c) || !c.empresa_id) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Enviar a {c.empresa_nombre}</h1>
        <p className="text-sm text-zinc-600">
          Oferta: {c.titulo}. Esto es <strong>exactamente</strong> lo que la empresa va a ver, ni más ni menos.
        </p>
      </div>

      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">Lo que NUNCA se comparte:</p>
        <p>La nota de recomendación, el porcentaje de ajuste al ATS, de dónde sale cada dato de tu CV, los huecos entre tu CV y la oferta, tu perfil humano (si lo tienes activado), tus preferencias de búsqueda y tus demás candidaturas.</p>
      </div>

      <details open className="rounded border border-zinc-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer font-medium">CV que vas a enviar</summary>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{c.cv_md}</pre>
      </details>
      {c.carta_md ? (
        <details className="rounded border border-zinc-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium">Carta de presentación</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{c.carta_md}</pre>
        </details>
      ) : <p className="rounded border border-zinc-200 bg-white p-3 text-sm text-zinc-600">Sin carta de presentación.</p>}

      <FormularioEnviar ofertaId={ofertaId} />
    </div>
  );
}
