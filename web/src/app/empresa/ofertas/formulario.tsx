"use client";
import { useActionState } from "react";
import {
  NIVELES_EMPRESA, REMOTOS_EMPRESA, CONTRATOS, IDIOMAS_TRABAJO, PERIODOS_SALARIO, SECTORES_FAMILIAS,
} from "@/lib/empresa-oferta-datos";
import type { EstadoOferta } from "./actions";

const caja = "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm";
const boton = "rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50";

export type ValoresOferta = {
  titulo: string; descripcion: string; ubicacion: string; remoto: string; contrato: string; idioma: string;
  nivel: string; sectorFamilia: string; requisitos: string; salarioPublicado: boolean; salarioMin: string;
  salarioMax: string; salarioPeriodo: string; avisos: { tipo: string; texto: string }[];
};

export const VALORES_VACIOS: ValoresOferta = {
  titulo: "", descripcion: "", ubicacion: "", remoto: "", contrato: "", idioma: "español", nivel: "",
  sectorFamilia: "", requisitos: "", salarioPublicado: false, salarioMin: "", salarioMax: "", salarioPeriodo: "anual", avisos: [],
};

type Props = {
  accion: (previo: EstadoOferta, f: FormData) => Promise<EstadoOferta>;
  valores: ValoresOferta;
  ofertaId?: string;
  textoBoton: string;
};

const avisoTexto = (v: ValoresOferta, tipo: string) => v.avisos.find((a) => a.tipo === tipo)?.texto ?? "";

export function FormularioOferta({ accion, valores: v, ofertaId, textoBoton }: Props) {
  const [estado, ejecutar, enCurso] = useActionState<EstadoOferta, FormData>(accion, { ok: false, errores: [] });
  return (
    <form action={ejecutar} className="max-w-2xl space-y-4 rounded border border-zinc-200 bg-white p-4">
      {ofertaId && <input type="hidden" name="oferta_id" value={ofertaId} />}

      <label className="block text-sm">Título del puesto
        <input name="titulo" defaultValue={v.titulo} required maxLength={200} className={caja} />
      </label>

      <label className="block text-sm">Descripción (texto plano, opcional)
        <textarea name="descripcion" defaultValue={v.descripcion} maxLength={8000} rows={5} className={caja} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Ciudad
          <input name="ubicacion" defaultValue={v.ubicacion} required maxLength={120} className={caja} />
        </label>
        <p className="text-sm text-zinc-500">País: España (único país disponible por ahora)</p>

        <label className="block text-sm">Modalidad
          <select name="remoto" defaultValue={v.remoto} required className={caja}>
            <option value="" disabled>elige…</option>
            {REMOTOS_EMPRESA.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="block text-sm">Contrato
          <select name="contrato" defaultValue={v.contrato} required className={caja}>
            <option value="" disabled>elige…</option>
            {CONTRATOS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-sm">Idioma de trabajo
          <select name="idioma" defaultValue={v.idioma} required className={caja}>
            {IDIOMAS_TRABAJO.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="block text-sm">Nivel
          <select name="nivel" defaultValue={v.nivel} required className={caja}>
            <option value="" disabled>elige…</option>
            {NIVELES_EMPRESA.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <label className="block text-sm">Sector y familia de puesto
        <select name="sectorFamilia" defaultValue={v.sectorFamilia} required className={caja}>
          <option value="" disabled>elige…</option>
          {Object.entries(SECTORES_FAMILIAS).map(([sector, familias]) => (
            <optgroup key={sector} label={sector}>
              {familias.map((familia) => <option key={familia} value={`${sector}::${familia}`}>{familia}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="block text-sm">Requisitos (uno por línea, opcional)
        <textarea name="requisitos" defaultValue={v.requisitos} rows={4} className={caja} />
      </label>

      <fieldset className="space-y-2 rounded border border-zinc-200 p-3">
        <legend className="text-sm font-medium">Sueldo</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="salarioPublicado" defaultChecked={v.salarioPublicado} /> Publicar el sueldo
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Mínimo (€)<input name="salarioMin" defaultValue={v.salarioMin} inputMode="numeric" className={caja} /></label>
          <label className="text-sm">Máximo (€)<input name="salarioMax" defaultValue={v.salarioMax} inputMode="numeric" className={caja} /></label>
          <label className="text-sm">Periodo
            <select name="salarioPeriodo" defaultValue={v.salarioPeriodo} className={caja}>
              {PERIODOS_SALARIO.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded border border-zinc-200 p-3">
        <legend className="text-sm font-medium">Avisos a la candidata (opcional; nunca se usan para filtrar ni puntuar)</legend>
        {([
          ["ciudadania", "Requiere ciudadanía o permiso concreto"],
          ["habilitacion_seguridad", "Requiere habilitación de seguridad"],
          ["residencia_o_permiso", "Requiere residencia o permiso de trabajo"],
        ] as const).map(([tipo, etiqueta]) => (
          <div key={tipo} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name={`aviso_${tipo}`} defaultChecked={avisoTexto(v, tipo) !== ""} /> {etiqueta}
            </label>
            <input name={`aviso_${tipo}_texto`} defaultValue={avisoTexto(v, tipo)} placeholder="texto exacto del aviso" maxLength={300} className={`${caja} flex-1`} />
          </div>
        ))}
        <label className="block text-sm">Otro aviso (texto libre, opcional)
          <input name="aviso_otro_texto" defaultValue={avisoTexto(v, "otro")} maxLength={300} className={caja} />
        </label>
      </fieldset>

      {estado.errores.length > 0 && (
        <ul role="alert" className="list-disc rounded bg-red-50 p-3 pl-6 text-sm text-red-800">
          {estado.errores.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      <button disabled={enCurso} className={boton}>{enCurso ? "Guardando…" : textoBoton}</button>
    </form>
  );
}
