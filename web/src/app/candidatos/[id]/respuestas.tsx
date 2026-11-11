"use client";
import { useActionState } from "react";
import { agregarRespuesta, borrarRespuesta, type EstadoRespuesta } from "../actions";

export type RespuestaVista = { tema: string; texto: string; fecha: string };
const caja = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm";

export default function Respuestas({ respuestas }: { respuestas: RespuestaVista[] }) {
  const [estado, accion, enCurso] = useActionState<EstadoRespuesta, FormData>(agregarRespuesta, { ok: false, error: null });
  const e = estado.ok ? undefined : estado.enviado;
  return (
    <section className="space-y-3 rounded border border-zinc-200 bg-white p-4">
      <h2 className="font-medium">Lo que me has contado</h2>
      <p className="text-xs text-zinc-600">
        Respóndelo una vez (por qué te atrae un tipo de trabajo, qué valoras, herramientas que dominas, logros) y Horma lo reutiliza en tus cartas
        sin volver a preguntártelo. Son tus palabras: se guardan tal cual y puedes borrarlas cuando quieras (si una carta en borrador ya usó una respuesta, pide de nuevo <code>/candidatura</code> en Claude Code para que la rehaga sin ella). No cuentes salud, origen,
        religión, ideología, orientación u otros datos de categorías especiales: Horma no los pide ni los usa.
      </p>
      {respuestas.length === 0 && <p className="text-sm text-zinc-500">Todavía no hay respuestas guardadas.</p>}
      <ul className="space-y-2">
        {respuestas.map((r, i) => (
          <li key={i} className="rounded border border-zinc-200 p-3 text-sm">
            <p className="font-medium">{r.tema} <span className="font-normal text-zinc-500">({r.fecha})</span></p>
            <p className="whitespace-pre-wrap">{r.texto}</p>
            <form action={borrarRespuesta} className="mt-1">
              <input type="hidden" name="tema" value={r.tema} />
              <input type="hidden" name="texto" value={r.texto} />
              <input type="hidden" name="fecha" value={r.fecha} />
              <button type="submit" className="text-xs underline">Borrar esta respuesta</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={accion} className="space-y-2">
        <label className="block text-sm">Tema
          <input name="tema" maxLength={120} defaultValue={e?.tema ?? ""} placeholder="Qué valoro en un trabajo" className={caja} />
        </label>
        <label className="block text-sm">Tu respuesta
          <textarea name="texto" rows={4} maxLength={1500} defaultValue={e?.texto ?? ""} className={caja} />
        </label>
        <button type="submit" disabled={enCurso} className="rounded bg-zinc-900 px-3 py-1 text-sm text-white disabled:opacity-50">
          {enCurso ? "Guardando…" : "Guardar respuesta"}
        </button>
        {estado.error && <p role="alert" className="text-sm text-red-700">{estado.error}</p>}
        {estado.ok && <p role="status" className="text-sm text-green-700">Guardada.</p>}
      </form>
    </section>
  );
}
