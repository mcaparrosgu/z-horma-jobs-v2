"use client";
import { useActionState } from "react";
import { cambiarContrasena, borrarCuenta, type EstadoCuenta } from "./actions";

const caja = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm";
const INICIAL: EstadoCuenta = { ok: false, error: null };

export function FormularioContrasena() {
  const [estado, accion, enCurso] = useActionState<EstadoCuenta, FormData>(cambiarContrasena, INICIAL);
  return (
    <form action={accion} className="space-y-3 rounded border border-zinc-200 bg-white p-4">
      <h2 className="font-medium">Cambiar contraseña</h2>
      <label className="block text-sm">Contraseña actual<input type="password" name="actual" required className={caja} /></label>
      <label className="block text-sm">Contraseña nueva (mínimo 12 caracteres)<input type="password" name="nueva" required minLength={12} className={caja} /></label>
      <label className="block text-sm">Repite la contraseña nueva<input type="password" name="repetir" required minLength={12} className={caja} /></label>
      {estado.error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{estado.error}</p>}
      {estado.ok && <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-800">Contraseña cambiada. Se cerraron tus otras sesiones.</p>}
      <button disabled={enCurso} className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
        {enCurso ? "Cambiando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}

export function FormularioBorrar({ tieneContrasena, email }: { tieneContrasena: boolean; email: string }) {
  const [estado, accion, enCurso] = useActionState<EstadoCuenta, FormData>(borrarCuenta, INICIAL);
  return (
    <form action={accion} className="space-y-3 rounded border border-red-200 bg-red-50 p-4">
      <h2 className="font-medium text-red-900">Borrar mi cuenta</h2>
      <p className="text-sm text-red-800">
        Esto borra tu cuenta, tu perfil, tus preferencias, tus recomendaciones, tus candidaturas y tus envíos a empresas, sin vuelta atrás.
        {tieneContrasena ? " Escribe tu contraseña para confirmarlo." : ` Entras con Google: escribe tu correo (${email}) para confirmarlo.`}
      </p>
      <label className="block text-sm">
        {tieneContrasena ? "Contraseña" : "Tu correo"}
        <input type={tieneContrasena ? "password" : "email"} name="confirmacion" required className={caja} />
      </label>
      {estado.error && <p role="alert" className="rounded bg-red-100 p-2 text-sm text-red-900">{estado.error}</p>}
      <button disabled={enCurso} className="rounded bg-red-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">
        {enCurso ? "Borrando…" : "Borrar mi cuenta para siempre"}
      </button>
    </form>
  );
}
