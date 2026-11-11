import { Suspense } from "react";
import { connection } from "next/server";
import { join } from "node:path";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/sesion";
import { SQL_PANEL_FUENTES } from "@/lib/panel";
import { errorSeguro } from "@/lib/importar";
import {
  SQL_MIGRACIONES, SQL_EVENTOS, SQL_CALIDAD_OFERTAS, SQL_ULTIMA_VERIFICACION,
  migracionesEnDisco, leerUltimosEvals, peor,
  piezaBaseDatos, piezaEventos, piezaFuente, piezaOfertas, piezaVerificacion, piezaEvals,
  type Pieza, type Semaforo, type FilaEventos, type FilaFuente, type CalidadOfertas, type FilaVerificacion,
} from "@/lib/salud";

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Comprobando piezas…</p>}><Salud /></Suspense>;
}

// El color nunca va solo: cada estado lleva también su palabra.
const ETIQUETA: Record<Semaforo, { texto: string; clase: string }> = {
  verde: { texto: "bien", clase: "bg-green-100 text-green-900 border-green-300" },
  ambar: { texto: "atención", clase: "bg-amber-100 text-amber-900 border-amber-300" },
  rojo: { texto: "falla", clase: "bg-red-100 text-red-900 border-red-300" },
  gris: { texto: "sin datos", clase: "bg-zinc-100 text-zinc-700 border-zinc-300" },
};

function Insignia({ estado }: { estado: Semaforo }) {
  const e = ETIQUETA[estado];
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${e.clase}`}>{e.texto}</span>;
}

function Tabla({ titulo, piezas, vacio }: { titulo: string; piezas: Pieza[]; vacio?: string }) {
  return (
    <section className="rounded border border-zinc-200 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-medium">{titulo} {piezas.length > 0 && <Insignia estado={peor(piezas.map((p) => p.estado))} />}</h2>
      {piezas.length === 0 ? <p className="text-sm text-zinc-600">{vacio ?? "Sin datos."}</p> : (
        <table className="w-full border-collapse text-left text-sm">
          <tbody>
            {piezas.map((p) => (
              <tr key={p.nombre} className="border-b border-zinc-200 align-top">
                <td className="p-2 whitespace-nowrap">{p.nombre}</td>
                <td className="p-2"><Insignia estado={p.estado} /></td>
                <td className="p-2">{p.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

async function Salud() {
  await requerirAdmin(); // sección de administración: el proxy solo mira que haya cookie
  await connection(); // se calcula en cada visita (usa la hora y la base): nunca en la compilación
  const raiz = join(process.cwd(), "..");
  const evals = piezaEvals(leerUltimosEvals(join(raiz, "evals", "resultados")));
  const enDisco = migracionesEnDisco(join(process.cwd(), "db", "migraciones"));

  // Cada consulta va por separado: si una falla, solo esa pieza se pinta como fallo y el resto se sigue viendo.
  const [mig, ev, fu, cal, ver] = await Promise.allSettled([
    db().query<{ aplicadas: number }>(SQL_MIGRACIONES),
    db().query<FilaEventos>(SQL_EVENTOS),
    db().query<FilaFuente>(SQL_PANEL_FUENTES),
    db().query<CalidadOfertas>(SQL_CALIDAD_OFERTAS),
    db().query<FilaVerificacion>(SQL_ULTIMA_VERIFICACION),
  ]);
  const caida = (nombre: string, r: PromiseRejectedResult): Pieza => {
    console.error(`salud (${nombre}):`, errorSeguro(r.reason)); // sin el mensaje de Postgres: podría repetir un valor
    return { nombre, estado: "rojo", motivo: "No se pudo consultar (mira el registro del servidor)." };
  };
  const basededatos = mig.status === "fulfilled" ? piezaBaseDatos(mig.value.rows[0].aplicadas, enDisco) : piezaBaseDatos(null, enDisco);
  if (mig.status === "rejected") console.error("salud (base de datos):", errorSeguro(mig.reason));
  const componentes: Pieza[] = ev.status === "fulfilled" ? ev.value.rows.map((f) => piezaEventos(f)) : [caida("Eventos", ev)];
  const fuentes: Pieza[] = fu.status === "fulfilled" ? fu.value.rows.map((f) => piezaFuente(f)) : [caida("Fuentes", fu)];
  const datos: Pieza[] = [
    cal.status === "fulfilled" ? piezaOfertas(cal.value.rows[0]) : caida("Ofertas guardadas", cal),
    ver.status === "fulfilled" ? piezaVerificacion(ver.value.rows[0] ?? null) : caida("Verificación archivos ↔ base", ver),
  ];

  const todas = [basededatos, ...componentes, ...fuentes, ...datos, evals];
  const resumen = peor(todas.map((p) => p.estado));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">Salud <Insignia estado={resumen} /></h1>
        <p className="text-sm text-zinc-600">
          Solo lectura: junta las señales que ya dejan las piezas de Horma. No ejecuta nada ni enseña datos de personas, solo recuentos y fechas.
        </p>
      </div>
      <Tabla titulo="Base de datos" piezas={[basededatos]} />
      <Tabla titulo="Componentes (eventos de los últimos 7 días)" piezas={componentes} vacio="Todavía ningún componente ha dejado eventos." />
      <Tabla titulo="Ingesta por fuente" piezas={fuentes} vacio="Ninguna fuente registrada todavía." />
      <Tabla titulo="Datos" piezas={datos} />
      <Tabla titulo="Pipelines (pista A)" piezas={[evals]} />
      <p className="text-sm text-zinc-600">
        Los agentes corren dentro de Claude Code y no dejan métricas de coste ni de tokens: por eso no aparecen aquí.
      </p>
    </div>
  );
}
