import { Suspense } from "react";
import Link from "next/link";
import { conUsuaria } from "@/lib/db";
import { requerirDuena } from "@/lib/sesion";
import { Aprobar, MarcarEnviada, RetirarEnvio, VersionNueva } from "./acciones";
import { enlaceSeguro } from "@/lib/matches";
import { preguntasSinContestar } from "@/lib/preguntas";
import Preguntas from "./preguntas";
import { modoDeEnvio } from "@/lib/empresa-envio";
import {
  SQL_CANDIDATURAS, SQL_RESPUESTAS_PERFIL, ETIQUETA_ESTADO, ETIQUETA_BANDEJA, huecosConAviso, huecosSinCubrir, porcentaje, type FilaCandidatura,
} from "@/lib/candidaturas";

export default function Pagina({ params }: PageProps<"/candidaturas/[id]">) {
  return <Suspense fallback={<p className="text-sm">Cargando candidaturas…</p>}><Candidaturas params={params} /></Suspense>;
}

// Todo el texto sale como texto de React (escapado); el CV y la carta se enseñan tal cual, sin interpretarlos como HTML.
async function Candidaturas({ params }: { params: PageProps<"/candidaturas/[id]">["params"] }) {
  const { id } = await params;
  const uid = (await requerirDuena(id)).usuaria_id;
  const [candidaturas, perfil] = await conUsuaria(uid, async (c) => [await c.query<FilaCandidatura>(SQL_CANDIDATURAS, [uid]), await c.query<{ respuestas: unknown }>(SQL_RESPUESTAS_PERFIL, [uid])] as const);
  const filas = candidaturas.rows;
  const respuestas = perfil.rows[0]?.respuestas ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/recomendaciones/${id}`} className="text-sm underline">← Recomendaciones</Link>
        <h1 className="text-2xl font-semibold">Tus candidaturas</h1>
        <p className="text-sm text-zinc-600">
          Aprobar y anotar el envío lo haces tú, aquí, con tu sesión: ningún agente aprueba por ti y Horma no envía nada sin tu orden. Tú copias el CV y la carta y envías por tu cuenta; después lo anotas.
        </p>
      </div>
      {filas.length === 0 ? (
        <p className="rounded border border-zinc-200 bg-white p-3 text-sm">
          Aún no hay candidaturas. Se generan con <code>/candidatura</code> en Claude Code y se cargan con <code>npm run importar</code>.
        </p>
      ) : (
        <ul className="space-y-6">
          {filas.map((c) => (
            <li key={c.oferta_id} className="space-y-3 rounded border border-zinc-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">
                  {enlaceSeguro(c.url) ? <a href={c.url} className="underline" rel="noreferrer noopener" target="_blank">{c.titulo}</a> : c.titulo}
                  <span className="font-normal text-zinc-600"> · {c.empresa}</span>
                </h2>
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{ETIQUETA_ESTADO[c.estado] ?? c.estado}</span>
              </div>

              {huecosConAviso(c.huecos).length > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                  <p className="font-medium">Revisa primero: dónde Horma reformuló o rellenó algo</p>
                  <ul className="list-disc pl-5">{huecosConAviso(c.huecos).map((h, k) => <li key={k}>{h.requisito}: {h.relleno_aviso}</li>)}</ul>
                </div>
              )}

              <div>
                <p className="text-xs text-zinc-600">
                  Cobertura de palabras clave de la oferta (ATS): {porcentaje(c.ats.cobertura)}
                  {c.ats.faltantes_sin_origen.length > 0 && ` · no constan en tu CV y no se añaden: ${c.ats.faltantes_sin_origen.join(", ")}`}
                </p>
                {(c.ats.no_medidos ?? []).length > 0 && (
                  <details className="mt-1 text-xs text-zinc-600">
                    <summary className="cursor-pointer underline">Requisitos que Horma no sabe medir ({c.ats.no_medidos!.length})</summary>
                    <p className="mt-1">No cuentan en el porcentaje y no significan que te falten: son cosas como años de experiencia o idiomas, que solo puedes valorar tú.</p>
                    <ul className="list-disc pl-5">{c.ats.no_medidos!.map((r, k) => <li key={k}>{r}</li>)}</ul>
                  </details>
                )}
              </div>

              {huecosSinCubrir(c.huecos).length > 0 && (
                <details open={huecosSinCubrir(c.huecos).some((h) => h.decision === "pendiente")}>
                  <summary className="cursor-pointer text-xs underline">Lo que la oferta pide y tu CV no recoge ({huecosSinCubrir(c.huecos).length})</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {huecosSinCubrir(c.huecos).map((h, k) => <li key={k}><strong>{h.requisito}</strong> — {h.propuesta}</li>)}
                  </ul>
                </details>
              )}

              {c.estado === "borrador" && <Preguntas preguntas={preguntasSinContestar(c.preguntas_pendientes, respuestas)} ofertaId={c.oferta_id} usuariaId={uid} />}

              <details>
                <summary className="cursor-pointer text-xs underline">CV adaptado ({c.cv_usado})</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">{c.cv_md}</pre>
              </details>
              {c.carta_md ? (
                <details>
                  <summary className="cursor-pointer text-xs underline">Carta de presentación</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">{c.carta_md}</pre>
                </details>
              ) : <p className="text-xs text-zinc-600">Sin carta todavía.</p>}

              {c.estado === "aprobada" && c.version_nueva && c.huella_version_nueva && c.estado_bandeja === null && (
                <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs">
                  <p className="font-medium">Hay una versión nueva del texto, sin aprobar</p>
                  <p>Lo que tú aprobaste no ha cambiado y es lo que se enviaría. Si prefieres la nueva, léela y úsala: volverá a borrador y tendrás que aprobarla otra vez.</p>
                  <details>
                    <summary className="cursor-pointer underline">Ver la versión nueva</summary>
                    <p className="mt-1 font-medium">CV</p>
                    <pre className="whitespace-pre-wrap rounded bg-white p-2">{c.version_nueva.cv_md}</pre>
                    {c.version_nueva.carta_md && (<><p className="mt-1 font-medium">Carta</p><pre className="whitespace-pre-wrap rounded bg-white p-2">{c.version_nueva.carta_md}</pre></>)}
                  </details>
                  {(c.version_nueva.huecos ?? []).some((h) => h.relleno_aviso) && (
                    <ul className="list-disc pl-5">{(c.version_nueva.huecos ?? []).filter((h) => h.relleno_aviso).map((h, k) => <li key={k}>Revisa en la nueva — {h.requisito}: {h.relleno_aviso}</li>)}</ul>
                  )}
                  <VersionNueva ofertaId={c.oferta_id} huella={c.huella_version_nueva} />
                </div>
              )}
              {c.estado === "borrador" && <Aprobar ofertaId={c.oferta_id} avisos={huecosConAviso(c.huecos).length} version={new Date(c.actualizado_en).toISOString()} />}
              {c.estado === "aprobada" && c.empresa_id && (
                <Link href={`/candidaturas/${id}/enviar/${c.oferta_id}`} className="inline-block rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">
                  Enviar a la empresa
                </Link>
              )}
              {c.estado === "enviada" && c.empresa_id && modoDeEnvio({ estado: c.estado, historial: c.historial, envio_vivo: c.estado_bandeja !== null }) === "reenvio" && (
                <div className="space-y-1 text-xs">
                  <p>Retiraste tu envío: la empresa ya no tiene tu candidatura.</p>
                  <Link href={`/candidaturas/${id}/enviar/${c.oferta_id}`} className="inline-block rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">
                    Volver a enviar a la empresa
                  </Link>
                </div>
              )}
              {c.estado === "aprobada" && !c.empresa_id && <MarcarEnviada ofertaId={c.oferta_id} />}
              {c.estado === "pendiente_de_ti" && (
                <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">No pasó el control: pide los cambios en Claude Code (<code>/candidatura</code>) antes de poder aprobarla.</p>
              )}
              {c.empresa_id && c.estado_bandeja && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs">
                  <span>La empresa la marcó como: <strong>{ETIQUETA_BANDEJA[c.estado_bandeja] ?? c.estado_bandeja}</strong>. Esto es solo información: no cambia tu candidatura por sí solo.</span>
                  <RetirarEnvio ofertaId={c.oferta_id} />
                </div>
              )}

              <p className="text-xs text-zinc-500">
                Historial: {c.historial.map((h) => `${h.estado} (${h.fecha}, ${h.por === "usuaria" ? "tú" : h.por})`).join(" → ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
