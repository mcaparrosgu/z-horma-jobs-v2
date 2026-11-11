"use client";
// Preguntas que la carta no puede sostener con tu CV ni con lo que ya contaste. Contestar guarda la respuesta en tu perfil
// (la misma que «Lo que me has contado»), con el tema de la pregunta: no se te vuelve a preguntar. Todo se enseña como texto.
import { useActionState } from "react";
import { agregarRespuesta, type EstadoRespuesta } from "@/app/candidatos/actions";

type PreguntaVista = { tema: string; pregunta: string; esencial: boolean };
const caja = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm";

function Una({ q }: { q: PreguntaVista }) {
  const [estado, accion, enCurso] = useActionState<EstadoRespuesta, FormData>(agregarRespuesta, { ok: false, error: null });
  const e = estado.ok ? undefined : estado.enviado;
  return (
    <li className="space-y-1 rounded border border-zinc-200 bg-white p-2">
      <form action={accion} className="space-y-1">
        <p className="text-xs"><strong>{q.pregunta}</strong> <span className="text-zinc-500">({q.esencial ? "importante" : "opcional"})</span></p>
        <input type="hidden" name="tema" value={q.tema} />
        <textarea name="texto" rows={3} maxLength={1500} defaultValue={e?.texto ?? ""} aria-label={q.pregunta} className={caja} />
        <button type="submit" disabled={enCurso} className="rounded bg-zinc-900 px-3 py-1 text-xs text-white disabled:opacity-50">
          {enCurso ? "Guardando…" : "Guardar en mi perfil"}
        </button>
        {estado.error && <p role="alert" className="text-xs text-red-700">{estado.error}</p>}
        {estado.ok && <p role="status" className="text-xs text-green-700">Guardada.</p>}
      </form>
    </li>
  );
}

export default function Preguntas({ preguntas, ofertaId, usuariaId }: { preguntas: PreguntaVista[]; ofertaId: string; usuariaId: string }) {
  if (preguntas.length === 0) return null;
  return (
    <div className="space-y-2 rounded border border-sky-200 bg-sky-50 p-2 text-xs">
      <p className="font-medium">Para mejorar tu carta, Horma necesita saber ({preguntas.length})</p>
      <p>
        Ni tu CV ni lo que ya has contado lo recogen, y Horma no se lo inventa. Tu respuesta se guarda en tu perfil («Lo que me has contado») y no se vuelve a preguntar.
        Si no quieres contestar, no pasa nada: la carta lo dirá en llano o lo omitirá. Estas preguntas salen de lo que pide la oferta: nunca escribas contraseñas, datos bancarios ni documentos de identidad, ni cuentes salud, origen, religión, ideología, orientación u otros datos de categorías especiales.
      </p>
      <ul className="space-y-2">{preguntas.map((q) => <Una key={q.tema} q={q} />)}</ul>
      <p>Cuando hayas contestado, pide en Claude Code <code>/candidatura {usuariaId} {ofertaId}</code> para que la carta use tus respuestas (rehace solo la carta y deja el borrador para que lo vuelvas a revisar).</p>
    </div>
  );
}
