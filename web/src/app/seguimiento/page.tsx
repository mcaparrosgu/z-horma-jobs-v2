import { Suspense } from "react";
import { conUsuaria } from "@/lib/db";
import { requerirSesion } from "@/lib/sesion";
import { SQL_CANDIDATURAS, ETIQUETA_ESTADO, sinRespuestaTrasDias, type FilaCandidatura } from "@/lib/candidaturas";
import { RegistrarRespuesta, ConfirmarSinRespuesta } from "./acciones";

// Orden de lectura: lo que necesita acción primero, lo cerrado (rechazada/descartada) al final.
const ORDEN = ["enviada", "entrevista", "aprobada", "pendiente_de_ti", "borrador", "sin_respuesta", "rechazada", "descartada"];

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando seguimiento…</p>}><Seguimiento /></Suspense>;
}

async function Seguimiento() {
  const s = await requerirSesion();
  const filas = (await conUsuaria(s.usuaria_id, (c) => c.query<FilaCandidatura>(SQL_CANDIDATURAS, [s.usuaria_id]))).rows;

  const porEstado = new Map<string, FilaCandidatura[]>();
  for (const c of filas) {
    const lista = porEstado.get(c.estado) ?? [];
    lista.push(c);
    porEstado.set(c.estado, lista);
  }
  const estados = [...ORDEN.filter((e) => porEstado.has(e)), ...[...porEstado.keys()].filter((e) => !ORDEN.includes(e))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Seguimiento</h1>
        <p className="text-sm text-zinc-600">
          Tus candidaturas, agrupadas por estado. Aquí registras tú la respuesta de cada empresa; Horma no cambia nada por su cuenta.
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="rounded border border-zinc-200 bg-white p-3 text-sm">
          Aún no hay candidaturas. Se generan con <code>/candidatura</code> en Claude Code.
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2 text-sm">
            {estados.map((e) => (
              <li key={e} className="rounded bg-zinc-100 px-2 py-1">{ETIQUETA_ESTADO[e] ?? e}: {porEstado.get(e)!.length}</li>
            ))}
          </ul>

          {estados.map((estado) => (
            <section key={estado} className="space-y-3">
              <h2 className="font-medium">{ETIQUETA_ESTADO[estado] ?? estado} ({porEstado.get(estado)!.length})</h2>
              <ul className="space-y-3">
                {porEstado.get(estado)!.map((c) => (
                  <li key={c.oferta_id} className="space-y-2 rounded border border-zinc-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium">{c.titulo} <span className="font-normal text-zinc-600">· {c.empresa}</span></h3>
                      <span className="text-xs text-zinc-500">último cambio: {new Date(c.actualizado_en).toISOString().slice(0, 10)}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Historial: {c.historial.map((h) => `${h.estado} (${h.fecha}, ${h.por === "usuaria" ? "tú" : h.por}${h.motivo ? `: ${h.motivo}` : ""})`).join(" → ")}
                    </p>
                    {sinRespuestaTrasDias(c.estado, new Date(c.actualizado_en)) && <ConfirmarSinRespuesta ofertaId={c.oferta_id} />}
                    <RegistrarRespuesta ofertaId={c.oferta_id} estadoActual={c.estado} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
