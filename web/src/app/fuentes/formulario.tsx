"use client";
import { useActionState } from "react";
import { guardarFuente, type EstadoFormulario } from "./actions";

export type ValoresFuente = {
  nombre: string; url: string; parametros: string; cabeceras: string; clave_env: string;
  clave_en: string; clave_nombre: string; mapeo_campos: string; activa: boolean;
};

export const VACIA: ValoresFuente = {
  nombre: "", url: "https://", parametros: "{}", cabeceras: "{}", clave_env: "", clave_en: "", clave_nombre: "",
  mapeo_campos: '{"lista": "", "id": "", "titulo": "", "empresa": "", "url": "", "descripcion": ""}', activa: false,
};

const caja = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm";

export default function Formulario({ valores: inicial }: { valores: ValoresFuente }) {
  const [estado, accion, enCurso] = useActionState<EstadoFormulario, FormData>(guardarFuente, { ok: false, errores: [] });
  const e = estado.enviado;
  const valores: ValoresFuente = e
    ? { nombre: e.nombre, url: e.url, parametros: e.parametros, cabeceras: e.cabeceras, clave_env: e.clave_env,
        clave_en: e.clave_en, clave_nombre: e.clave_nombre, mapeo_campos: e.mapeo_campos, activa: e.activa === "on" }
    : inicial;
  return (
    <form action={accion} className="space-y-3 rounded border border-zinc-200 bg-white p-4">
      <h2 className="font-medium">{valores.nombre ? `Editar «${valores.nombre}»` : "Nueva fuente"}</h2>
      <p className="text-xs text-zinc-600">
        Solo se activa una fuente que haya pasado <code>/calificar-fuentes</code> con apta = true. La clave nunca se escribe aquí:
        se escribe el NOMBRE de la variable de entorno (p. ej. <code>ADZUNA_KEY</code>).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nombre<input name="nombre" defaultValue={valores.nombre} readOnly={!!valores.nombre} className={caja} required /></label>
        <label className="text-sm">URL (https, sin parámetros)<input name="url" defaultValue={valores.url} className={caja} required /></label>
        <label className="text-sm">Variable de la clave (opcional)<input name="clave_env" defaultValue={valores.clave_env} className={caja} /></label>
        <label className="text-sm">La clave va en
          <select name="clave_en" defaultValue={valores.clave_en} className={caja}>
            <option value="">—</option><option value="cabecera">cabecera</option><option value="parametro">parámetro</option>
          </select>
        </label>
        <label className="text-sm">Nombre de esa cabecera o parámetro<input name="clave_nombre" defaultValue={valores.clave_nombre} className={caja} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activa" defaultChecked={valores.activa} /> Activa</label>
      </div>
      <label className="block text-sm">Parámetros (JSON)<textarea name="parametros" defaultValue={valores.parametros} rows={2} className={`${caja} font-mono`} /></label>
      <label className="block text-sm">Cabeceras (JSON)<textarea name="cabeceras" defaultValue={valores.cabeceras} rows={2} className={`${caja} font-mono`} /></label>
      <label className="block text-sm">Mapeo de campos (JSON)<textarea name="mapeo_campos" defaultValue={valores.mapeo_campos} rows={4} className={`${caja} font-mono`} /></label>
      {estado.errores.length > 0 && (
        <ul role="alert" className="list-disc rounded bg-red-50 p-3 pl-6 text-sm text-red-800">
          {estado.errores.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {estado.ok && <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">Guardada: {estado.guardada}</p>}
      <button disabled={enCurso} className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
        {enCurso ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
