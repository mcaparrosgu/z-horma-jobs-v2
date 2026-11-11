import { Suspense } from "react";
import Link from "next/link";
import { conUsuaria } from "@/lib/db";
import { requerirDuena } from "@/lib/sesion";
import { SQL_MATCHES, SQL_MATCHES_TOTAL, ETIQUETA_CONDICIONES, enlaceSeguro, type FilaMatch } from "@/lib/matches";
import { etiquetaTransparencia } from "@/lib/calidad-ofertas";

export default function Pagina({ params }: PageProps<"/recomendaciones/[id]">) {
  return <Suspense fallback={<p className="text-sm">Cargando recomendaciones…</p>}><Recomendaciones params={params} /></Suspense>;
}

// Todo el texto sale como texto de React (escapado); nunca como HTML.
async function Recomendaciones({ params }: { params: PageProps<"/recomendaciones/[id]">["params"] }) {
  const { id } = await params;
  const uid = (await requerirDuena(id)).usuaria_id;
  const [r, total] = await conUsuaria(uid, async (c) => [
    await c.query<FilaMatch>(SQL_MATCHES, [uid]),
    await c.query<{ n: string }>(SQL_MATCHES_TOTAL, [uid]),
  ] as const);
  const filas = r.rows;
  // Las cerradas o repetidas no se muestran, pero se avisa de cuántas son (nada desaparece sin explicación).
  const ocultas = Math.max(0, Number(total.rows[0]?.n ?? 0) - filas.length);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/candidatos/${id}`} className="text-sm underline">← Perfil</Link>
        <h1 className="text-2xl font-semibold">Tus ofertas recomendadas</h1>
        <p className="text-sm text-zinc-600">
          La nota (0-100) mide solo experiencia y formación frente a los requisitos; «sin nota» significa que la oferta no trae requisitos para medirla (aparecen al final). Las condiciones de trabajo van aparte.
          Es una ayuda para decidir, no una decisión: la candidata siempre decide. Esta lista es para la candidata; Horma no la comparte con empresas.
        </p>
      </div>
      {filas.length === 0 ? (
        <p className="rounded border border-zinc-200 bg-white p-3 text-sm">
          Aún no hay recomendaciones. Se generan con <code>/recomendar</code> en Claude Code y se cargan con <code>npm run importar</code>.
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">Versión de perfil {filas[0].version_perfil} · {filas.length} ofertas</p>
          {ocultas > 0 && <p className="text-xs text-zinc-500">Hay {ocultas} más que no se muestran porque ya cerraron o son la misma oferta publicada en otra fuente.</p>}
          <ul className="space-y-3">
            {filas.map((m) => (
              <li key={m.oferta_id} className="rounded border border-zinc-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-medium">
                    {enlaceSeguro(m.url) ? <a href={m.url} className="underline" rel="noreferrer noopener" target="_blank">{m.titulo}</a> : m.titulo}
                  </h2>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{m.nota === null ? "sin nota" : `nota ${m.nota}`}</span>
                </div>
                <p className="text-xs text-zinc-600">
                  {m.empresa} · {m.ubicacion}{m.pais ? ` (${m.pais})` : ""} · {m.remoto} · {ETIQUETA_CONDICIONES[m.nivel_condiciones]}
                  {m.sin_sueldo ? " · sin sueldo publicado" : ""}
                </p>
                <p className="mt-2">{m.explicacion}</p>
                {/* Etiqueta de transparencia (A1): solo hechos; no entra en la nota. */}
                <p className="mt-2 text-xs text-zinc-600" data-etiqueta="transparencia">
                  {etiquetaTransparencia({ ...m, fecha: m.fecha_oferta_texto, fecha_cierre: m.fecha_cierre_texto }, hoy).join(" · ")}
                </p>
                {(m.avisos ?? []).length > 0 && (
                  <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                    Avisos de la oferta (informativos; no cuentan en la nota):{" "}
                    {(m.avisos ?? []).map((a) => `${a.tipo ?? ""}: ${a.texto ?? ""}`).join(" · ")}
                  </p>
                )}
                {m.correccion && <p className="mt-2 text-xs text-zinc-600">Corrección de la candidata: {m.correccion}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
