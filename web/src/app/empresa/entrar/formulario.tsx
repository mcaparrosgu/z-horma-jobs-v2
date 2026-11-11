"use client";
import { useActionState } from "react";
import { entrarEmpresa, type EstadoAccesoEmpresa } from "../actions";

const caja = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm";
const boton = "rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50";

export function FormularioEntrarEmpresa() {
  const [estado, accion, enCurso] = useActionState<EstadoAccesoEmpresa, FormData>(entrarEmpresa, { error: null });
  return (
    <form action={accion} className="space-y-3 rounded border border-zinc-200 bg-white p-4">
      <label className="block text-sm">Correo<input name="email" type="email" defaultValue={estado.email} autoComplete="email" className={caja} required maxLength={254} /></label>
      <label className="block text-sm">Contraseña<input name="contrasena" type="password" autoComplete="current-password" className={caja} required maxLength={128} /></label>
      {estado.error && <p role="alert" className="text-sm text-red-700">{estado.error}</p>}
      <button className={boton} disabled={enCurso}>{enCurso ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
