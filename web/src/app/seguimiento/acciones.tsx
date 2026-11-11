"use client";
import { useActionState } from "react";
import { registrarRespuesta, type EstadoAccion } from "./actions";
import { destinosDe, ETIQUETA_ESTADO, NOTA_MAX } from "@/lib/candidaturas";

const boton = "rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50";
const INICIAL: EstadoAccion = { ok: false, mensaje: null };

export function RegistrarRespuesta({ ofertaId, estadoActual }: { ofertaId: string; estadoActual: string }) {
  const destinos = destinosDe(estadoActual);
  const [estado, accion, enCurso] = useActionState<EstadoAccion, FormData>(registrarRespuesta, INICIAL);
  if (destinos.length === 0) return null;
  return (
    <form action={accion} className="space-y-2 rounded border border-zinc-300 bg-zinc-50 p-2">
      <input type="hidden" name="oferta_id" value={ofertaId} />
      <input type="hidden" name="estado_actual" value={estadoActual} />
      <label className="block text-xs">Registrar respuesta
        <select name="estado" defaultValue="" className="ml-2 rounded border border-zinc-300 bg-white px-1 py-0.5" required>
          <option value="" disabled>elige…</option>
          {destinos.map((d) => <option key={d} value={d}>{ETIQUETA_ESTADO[d] ?? d}</option>)}
        </select>
      </label>
      <label className="block text-xs">
        Nota (opcional, hasta {NOTA_MAX} caracteres)
        <textarea name="nota" maxLength={NOTA_MAX} rows={2} className="mt-1 block w-full rounded border border-zinc-300 bg-white p-1 text-xs" />
        <span className="text-zinc-500">No escribas datos de otra persona (nombre o correo de quien te entrevistó, por ejemplo).</span>
      </label>
      <button className={boton} disabled={enCurso}>{enCurso ? "Registrando…" : "Registrar"}</button>
      {estado.mensaje && <p role="status" className={`text-xs ${estado.ok ? "text-green-800" : "text-red-700"}`}>{estado.mensaje}</p>}
    </form>
  );
}

/** Aviso de los 21 días: solo informa; la usuaria confirma con este botón. No hay tareas programadas. */
export function ConfirmarSinRespuesta({ ofertaId }: { ofertaId: string }) {
  const [estado, accion, enCurso] = useActionState<EstadoAccion, FormData>(registrarRespuesta, INICIAL);
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs">
      <input type="hidden" name="oferta_id" value={ofertaId} />
      <input type="hidden" name="estado_actual" value="enviada" />
      <input type="hidden" name="estado" value="sin_respuesta" />
      <span>Van 21 días o más sin respuesta.</span>
      <button className="rounded bg-amber-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50" disabled={enCurso}>
        {enCurso ? "Confirmando…" : "Confirmar sin respuesta"}
      </button>
      {estado.mensaje && <p role="status" className="w-full">{estado.mensaje}</p>}
    </form>
  );
}
