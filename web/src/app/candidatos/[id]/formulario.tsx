"use client";
import { useActionState } from "react";
import { guardarPreferencias, type EstadoPrefs } from "../actions";

export type ValoresPrefs = {
  puestos: string; ciudades: string; paises: string; contrato: string; idiomas: string; sectores: string; niveles: string;
  sueldo_min: string; rango_min: string; rango_max: string; remoto: string[]; horario: string[];
};

const caja = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm";
const LISTAS: [keyof ValoresPrefs, string, string][] = [
  ["puestos", "Puestos", "Analista de datos, BI"], ["ciudades", "Ciudades", "Madrid, Valencia"],
  ["paises", "Países (código de 2 letras)", "ES, FR"], ["contrato", "Contrato", "indefinido, temporal"],
  ["idiomas", "Idiomas", "Español, Inglés"], ["sectores", "Sectores", ""], ["niveles", "Niveles", "junior, medio"],
];

export default function FormularioPrefs({ valores: inicial }: { valores: ValoresPrefs }) {
  const [estado, accion, enCurso] = useActionState<EstadoPrefs, FormData>(guardarPreferencias, { ok: false, errores: [] });
  const e = estado.enviado as Partial<ValoresPrefs> | undefined;
  const v: ValoresPrefs = { ...inicial, ...(e ?? {}) };
  return (
    <form action={accion} className="space-y-3 rounded border border-zinc-200 bg-white p-4">
      <h2 className="font-medium">Preferencias de búsqueda</h2>
      <p className="text-xs text-zinc-600">Listas separadas por comas. Aquí no hay edad, nacionalidad ni datos de categorías especiales, y Horma no los pide.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {LISTAS.map(([campo, etiqueta, ej]) => (
          <label key={campo} className="text-sm">{etiqueta}
            <input name={campo} defaultValue={v[campo] as string} placeholder={ej} className={caja} />
          </label>
        ))}
        <label className="text-sm">Sueldo mínimo (anual)<input name="sueldo_min" defaultValue={v.sueldo_min} inputMode="decimal" className={caja} /></label>
        <div className="flex flex-wrap gap-3">
          <p className="w-full text-xs text-zinc-600">Rango de nota de compatibilidad de las <em>ofertas</em> que quieres ver; no es una nota sobre ti.</p>
          <label className="text-sm">Compatibilidad mín.<input name="rango_min" defaultValue={v.rango_min} inputMode="numeric" className={caja} /></label>
          <label className="text-sm">máx.<input name="rango_max" defaultValue={v.rango_max} inputMode="numeric" className={caja} /></label>
        </div>
      </div>
      <fieldset className="flex gap-4 text-sm">
        <legend className="mb-1">Modalidad</legend>
        {["presencial", "hibrido", "remoto"].map((m) => (
          <label key={m} className="flex items-center gap-1"><input type="checkbox" name="remoto" value={m} defaultChecked={v.remoto.includes(m)} /> {m}</label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1">Horario preferido <span className="text-xs text-zinc-600">(Horma lo compara solo si la oferta indica horario)</span></legend>
        {[["manana", "mañana"], ["tarde", "tarde"], ["noche", "noche"], ["flexible", "flexible"]].map(([valor, texto]) => (
          <label key={valor} className="flex items-center gap-1"><input type="checkbox" name="horario" value={valor} defaultChecked={v.horario.includes(valor)} /> {texto}</label>
        ))}
      </fieldset>
      {estado.errores.length > 0 && (
        <ul role="alert" className="list-disc rounded bg-red-50 p-3 pl-6 text-sm text-red-800">
          {estado.errores.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
      {estado.ok && <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">Preferencias guardadas.</p>}
      <button disabled={enCurso} className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">{enCurso ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}
