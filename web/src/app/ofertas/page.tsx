import { Suspense } from "react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/sesion";
import { NIVELES, REMOTOS, LIMITE_OFERTAS, SQL_OPCIONES, SQL_TOTAL_OFERTAS, sqlOfertas, type FiltrosOfertas } from "@/lib/consultas";
import { etiquetaTransparencia } from "@/lib/calidad-ofertas";

type Fila = {
  id: string; fuente: string; url: string; fecha: Date | null; titulo: string; empresa: string; ubicacion: string;
  pais: string | null; remoto: string; nivel: string; sector: string | null; familia: string | null;
  salario: { publicado: boolean; min: number | null; max: number | null; moneda: string | null; periodo?: string | null };
  stack: string[];
  licencia: string | null; atribucion: string | null;
  primera_vista: Date | null; ultima_vista: Date | null; veces_vista: number;
  fecha_texto: string | null; fecha_cierre_texto: string | null; recurrente: boolean; fuentes_grupo: string[];
  avisos: { tipo: string; texto: string }[];
  auditoria: {
    fantasma?: { sospechosa?: boolean; motivos?: string[] };
    fraude?: { sospechosa?: boolean; motivos?: string[] };
    empresa_validada?: { valor?: string; motivo?: string };
    transparencia?: { salario_publicado?: boolean; frase_para_pedirlo?: string | null };
    instrucciones_embebidas?: string[];
  };
};

// Qué significa cada licencia de origen, en llano (la fija el script de ingesta según la fuente).
const LICENCIAS: Record<string, string> = {
  abierto: "datos abiertos de la fuente (condiciones en la oferta original)", empresa: "publicada por la empresa", socio: "programa de socios", usuaria: "la trajo la usuaria",
};

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
// Un enlace solo se pinta si es http(s); lo demás se muestra como texto plano (hallazgo h).
const enlaceSeguro = (u: string) => /^https?:\/\//i.test(u);

// Las demás fuentes de un grupo de duplicados (las filas siguen en la base con su licencia y atribución).
const otrasFuentes = (o: Fila) => [...new Set(o.fuentes_grupo)].filter((f) => f !== o.fuente);

function Insignia({ mala, texto, detalle }: { mala: boolean; texto: string; detalle?: string }) {
  return (
    <span title={detalle} className={`rounded px-1.5 py-0.5 text-xs ${mala ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
      {texto}
    </span>
  );
}

export default function Pagina({ searchParams }: PageProps<"/ofertas">) {
  return <Suspense fallback={<p className="text-sm">Cargando ofertas…</p>}><Ofertas searchParams={searchParams} /></Suspense>;
}

async function Ofertas({ searchParams }: { searchParams: PageProps<"/ofertas">["searchParams"] }) {
  await requerirSesion();
  const sp = await searchParams;
  const filtros: FiltrosOfertas = {
    q: uno(sp.q), pais: uno(sp.pais), nivel: uno(sp.nivel), remoto: uno(sp.remoto),
    sector: uno(sp.sector), familia: uno(sp.familia),
  };
  const { sql, params } = sqlOfertas(filtros);
  const [ofertas, total, opciones] = await Promise.all([
    db().query<Fila>(sql, params),
    db().query<{ n: number }>(SQL_TOTAL_OFERTAS),
    db().query<{ campo: string; valor: string }>(SQL_OPCIONES),
  ]);
  const hoy = new Date().toISOString().slice(0, 10);
  const de = (campo: string) => opciones.rows.filter((o) => o.campo === campo).map((o) => o.valor);
  const caja = "rounded border border-zinc-300 bg-white px-2 py-1 text-sm";
  const selectores: [string, string, string[]][] = [
    ["pais", "País", de("pais")], ["nivel", "Nivel", [...NIVELES]], ["remoto", "Modalidad", [...REMOTOS]],
    ["sector", "Sector", de("sector")], ["familia", "Familia", de("familia")],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ofertas</h1>
      <form className="flex flex-wrap items-end gap-3 rounded border border-zinc-200 bg-white p-3" method="get">
        <label className="text-sm">Buscar<br />
          <input name="q" defaultValue={filtros.q ?? ""} maxLength={80} className={caja} placeholder="título o empresa" />
        </label>
        {selectores.map(([nombre, etiqueta, valores]) => (
          <label key={nombre} className="text-sm">{etiqueta}<br />
            <select name={nombre} defaultValue={uno(sp[nombre]) ?? ""} className={caja}>
              <option value="">Todos</option>
              {valores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}
        <button className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white">Filtrar</button>
        <a href="/ofertas" className="px-2 py-1.5 text-sm underline">Limpiar</a>
      </form>

      <p className="text-sm text-zinc-600">
        Mostrando {ofertas.rows.length} de {total.rows[0].n} ofertas (máximo {LIMITE_OFERTAS}).
        {de("sector").length === 0 && " Sector y familia están vacíos: las ofertas aún no están clasificadas."}
      </p>

      {ofertas.rows.length === 0 && (
        <p className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm">No hay ofertas con estos filtros.</p>
      )}
      <ul className="space-y-3">
        {ofertas.rows.map((o) => {
          const a = o.auditoria;
          const frases = a.instrucciones_embebidas ?? [];
          return (
            <li key={o.id} className="rounded border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{o.titulo}</h2>
                <span className="text-xs text-zinc-500">{o.fuente} · {o.fecha_texto ?? "sin fecha"}</span>
              </div>
              <p className="text-sm text-zinc-700">{o.empresa} · {o.ubicacion} · {o.remoto} · {o.nivel}</p>
              <p className="text-sm text-zinc-700">
                Sueldo: {o.salario.publicado ? `${o.salario.min ?? "?"}–${o.salario.max ?? "?"} ${o.salario.moneda ?? ""} ${o.salario.periodo ?? ""}` : "no publicado"}
                {o.stack.length > 0 && ` · ${o.stack.join(", ")}`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">Auditoría:</span>
                <Insignia mala={!!a.fantasma?.sospechosa} texto={a.fantasma?.sospechosa ? "posible fantasma" : "no parece fantasma"} detalle={a.fantasma?.motivos?.join(" · ")} />
                <Insignia mala={!!a.fraude?.sospechosa} texto={a.fraude?.sospechosa ? "posible fraude" : "sin señales de fraude"} detalle={a.fraude?.motivos?.join(" · ")} />
                <Insignia mala={a.empresa_validada?.valor !== "si"} texto={`empresa: ${a.empresa_validada?.valor ?? "no comprobada"}`} detalle={a.empresa_validada?.motivo} />
                <Insignia mala={!o.salario.publicado} texto={o.salario.publicado ? "sueldo publicado" : "sin sueldo"} detalle={a.transparencia?.frase_para_pedirlo ?? undefined} />
                {frases.length > 0 && <Insignia mala texto={`${frases.length} instrucción(es) oculta(s) ignorada(s)`} detalle="Texto de la oferta dirigido a un agente; se guarda pero no se sigue." />}
              </div>
              {o.avisos.length > 0 && (
                // Solo informan a la usuaria: no entran en la nota, el filtro ni lo que ve una empresa (regla de lineas-rojas).
                <ul className="mt-2 space-y-1">
                  {o.avisos.map((av, i) => (
                    <li key={i} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Aviso: {av.texto}</li>
                  ))}
                </ul>
              )}
              {/* Etiqueta de transparencia (A1): solo hechos (antigüedad, veces vista, fuente, licencia y marcas de vigencia). */}
              <p className="mt-2 text-xs text-zinc-600" data-etiqueta="transparencia">
                {etiquetaTransparencia({ ...o, fecha: o.fecha_texto, fecha_cierre: o.fecha_cierre_texto }, hoy).join(" · ")}
              </p>
              {otrasFuentes(o).length > 0 && (
                <p className="text-xs text-zinc-600">También publicada en: {otrasFuentes(o).join(", ")} (la misma oferta; aquí se muestra una sola vez).</p>
              )}
              <p className="mt-2 text-xs text-zinc-600">
                Origen: {o.fuente} · licencia: {o.licencia ? (LICENCIAS[o.licencia] ?? o.licencia) : "no indicada"}
                {o.atribucion && ` · ${o.atribucion}`}
              </p>
              {enlaceSeguro(o.url)
                ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm underline">Ver oferta original</a>
                : <span className="mt-1 inline-block text-sm text-zinc-500">{o.url}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
