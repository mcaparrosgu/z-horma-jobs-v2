"use client";
import { useActionState, useState } from "react";
import { enviarAEmpresa, type EstadoEnvio } from "./actions";
import { NOMBRE_CONTACTO_MAX } from "@/lib/empresa-envio";

export function FormularioEnviar({ ofertaId }: { ofertaId: string }) {
  const [estado, accion, enCurso] = useActionState<EstadoEnvio, FormData>(enviarAEmpresa, { ok: false, mensaje: null });
  const [compartir, setCompartir] = useState(false);
  return (
    <form action={accion} className="space-y-3 rounded border border-zinc-200 bg-white p-4">
      <input type="hidden" name="oferta_id" value={ofertaId} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="compartir_contacto" className="mt-0.5" checked={compartir} onChange={(e) => setCompartir(e.target.checked)} />
        <span>Compartir también mi nombre y mi correo de contacto (si no marcas esto, la empresa solo recibe el CV y la carta).</span>
      </label>
      {compartir && (
        <label className="block text-sm">Tu nombre
          <input name="nombre_contacto" maxLength={NOMBRE_CONTACTO_MAX} required className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm" />
        </label>
      )}
      {estado.mensaje && <p role="alert" className={`text-sm ${estado.ok ? "text-green-800" : "text-red-700"}`}>{estado.mensaje}</p>}
      <button disabled={enCurso} className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {enCurso ? "Enviando…" : "Enviar a la empresa"}
      </button>
    </form>
  );
}
