import { Suspense } from "react";
import Link from "next/link";
import { conUsuaria } from "@/lib/db";
import { SQL_PERFIL, SQL_PREFERENCIAS } from "@/lib/preferencias";
import { requerirDuena } from "@/lib/sesion";
import FormularioPrefs, { type ValoresPrefs } from "./formulario";
import Respuestas from "./respuestas";
import { comoRespuesta } from "@/lib/respuestas";

type Origen = { archivo: string; fragmento: string; linea?: number | null };
type Perfil = {
  experiencias: { cargo: string; empresa: string; inicio: string; fin: string; descripcion?: string[]; origen: Origen }[];
  formacion: { titulo: string; centro: string; inicio?: string | null; fin: string; origen: Origen }[];
  skills: { nombre: string; origen: Origen }[];
  idiomas: { idioma: string; nivel?: string | null; origen: Origen }[];
  taxonomia: {
    sectores?: string[]; familias?: string[]; nivel?: string | null; stack?: string[];
    niveles_por_familia?: { familia: string; nivel: string; origen: Origen }[];
  };
  preguntas_pendientes: string[];
  cv_texto: string | null;
  respuestas: unknown;
};
type Prefs = {
  puestos: string[]; ciudades: string[]; paises: string[]; remoto: string[]; contrato: string[]; idiomas: string[];
  sectores: string[]; niveles: string[]; horario: string[]; sueldo_min: string | null; rango_compatibilidad: number[];
};

// Todo el texto sale como texto de React (escapado); nunca como HTML.
function De({ o }: { o: Origen }) {
  return (
    <details className="mt-1 text-xs text-zinc-600">
      <summary className="cursor-pointer">de dónde sale</summary>
      <p className="mt-1 rounded bg-zinc-50 p-2">
        {o.archivo}{o.linea ? `, línea ${o.linea}` : ""}: «{o.fragmento}»
      </p>
    </details>
  );
}

export default function Pagina({ params }: PageProps<"/candidatos/[id]">) {
  return <Suspense fallback={<p className="text-sm">Cargando perfil…</p>}><Candidata params={params} /></Suspense>;
}

async function Candidata({ params }: { params: PageProps<"/candidatos/[id]">["params"] }) {
  const { id } = await params;
  const uid = (await requerirDuena(id)).usuaria_id; // `id` de la URL es el opaco; solo su dueña pasa
  const [p, pr] = await conUsuaria(uid, async (c) => [await c.query<Perfil>(SQL_PERFIL, [uid]), await c.query<Prefs>(SQL_PREFERENCIAS, [uid])] as const);
  if (p.rows.length === 0) {
    // Cuenta recién creada: la dueña existe pero aún no hay perfil. Antes daba 404.
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Tu perfil</h1>
        <p className="text-sm text-zinc-700">Todavía no tienes perfil. Horma lo construye a partir de tu CV, y cada dato dirá de qué parte del CV salió.</p>
        <p className="text-sm text-zinc-600">Cuando exista, aquí verás tu experiencia, formación y habilidades, y podrás contarme lo que valoras en un trabajo.</p>
      </div>
    );
  }
  const perfil = p.rows[0];
  const pref = pr.rows[0];
  const rango = pref?.rango_compatibilidad ?? [0, 100];
  const valores: ValoresPrefs = {
    puestos: (pref?.puestos ?? []).join(", "), ciudades: (pref?.ciudades ?? []).join(", "), paises: (pref?.paises ?? []).join(", "),
    contrato: (pref?.contrato ?? []).join(", "), idiomas: (pref?.idiomas ?? []).join(", "), sectores: (pref?.sectores ?? []).join(", "),
    niveles: (pref?.niveles ?? []).join(", "), sueldo_min: pref?.sueldo_min ?? "", rango_min: String(rango[0]), rango_max: String(rango[1]),
    remoto: pref?.remoto ?? [], horario: pref?.horario ?? [],
  };
  const t = perfil.taxonomia;
  const clasificacion = [...(t.sectores ?? []), ...(t.familias ?? []), t.nivel, ...(t.stack ?? [])].filter(Boolean).join(" · ");
  const niveles = (t.niveles_por_familia ?? []).map((x) => `${x.familia}: ${x.nivel}`).join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/recomendaciones/${id}`} className="text-sm underline">Ofertas recomendadas</Link>{" · "}<Link href={`/candidaturas/${id}`} className="text-sm underline">Candidaturas</Link>
        <h1 className="text-2xl font-semibold">Tu perfil</h1>
        <p className="text-sm text-zinc-600">
          Cada dato de las listas de abajo dice de qué parte del CV salió.
          {clasificacion ? ` Clasificación sugerida por Horma (no sale del CV): ${clasificacion}.` : ""}
          {niveles ? ` Nivel por área (sugerido a partir de su CV o de lo que ella dice; ella puede corregirlo): ${niveles}.` : ""}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Experiencia</h2>
        {perfil.experiencias.length === 0 && <p className="text-sm text-zinc-500">Sin experiencias.</p>}
        {perfil.experiencias.map((e, i) => (
          <div key={i} className="rounded border border-zinc-200 bg-white p-3 text-sm">
            <p className="font-medium">{e.cargo} · {e.empresa} <span className="font-normal text-zinc-500">({e.inicio}–{e.fin})</span></p>
            <ul className="list-disc pl-5">{(e.descripcion ?? []).map((d, j) => <li key={j}>{d}</li>)}</ul>
            <De o={e.origen} />
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Formación</h2>
        {perfil.formacion.map((f, i) => (
          <div key={i} className="rounded border border-zinc-200 bg-white p-3 text-sm">
            <p>{f.titulo} · {f.centro} <span className="text-zinc-500">({f.fin})</span></p>
            <De o={f.origen} />
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-medium">Habilidades</h2>
          {perfil.skills.map((s, i) => (
            <div key={i} className="rounded border border-zinc-200 bg-white p-2 text-sm">{s.nombre}<De o={s.origen} /></div>
          ))}
        </div>
        <div className="space-y-2">
          <h2 className="font-medium">Idiomas</h2>
          {perfil.idiomas.map((s, i) => (
            <div key={i} className="rounded border border-zinc-200 bg-white p-2 text-sm">{s.idioma}{s.nivel ? ` (${s.nivel})` : ""}<De o={s.origen} /></div>
          ))}
        </div>
      </section>

      {perfil.preguntas_pendientes.length > 0 && (
        <section className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <h2 className="font-medium">Preguntas pendientes: Horma las necesita contestadas antes de usar ese dato (para no inventar nada)</h2>
          <ul className="list-disc pl-5">{perfil.preguntas_pendientes.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </section>
      )}

      {perfil.cv_texto && (
        <details className="rounded border border-zinc-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium">Ver el CV original</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{perfil.cv_texto}</pre>
        </details>
      )}

      <Respuestas respuestas={(Array.isArray(perfil.respuestas) ? perfil.respuestas : []).map(comoRespuesta).filter((r) => r !== null)} />

      <FormularioPrefs valores={valores} />
    </div>
  );
}
