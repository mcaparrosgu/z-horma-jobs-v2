import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/sesion";
import { SQL_FUENTES } from "@/lib/consultas";
import Formulario, { VACIA, type ValoresFuente } from "./formulario";

type Fuente = {
  nombre: string; url: string; parametros: object; cabeceras: object; clave_env: string | null;
  clave_en: string | null; clave_nombre: string | null; mapeo_campos: object; activa: boolean;
};

export default function Pagina({ searchParams }: PageProps<"/fuentes">) {
  return <Suspense fallback={<p className="text-sm">Cargando fuentes…</p>}><Fuentes searchParams={searchParams} /></Suspense>;
}

async function Fuentes({ searchParams }: { searchParams: PageProps<"/fuentes">["searchParams"] }) {
  await requerirAdmin(); // sección de administración: el proxy solo mira que haya cookie
  const sp = await searchParams;
  const editar = Array.isArray(sp.editar) ? sp.editar[0] : sp.editar;
  const { rows } = await db().query<Fuente>(SQL_FUENTES);
  const f = rows.find((r) => r.nombre === editar);
  const valores: ValoresFuente = f
    ? {
        nombre: f.nombre, url: f.url, parametros: JSON.stringify(f.parametros, null, 1), cabeceras: JSON.stringify(f.cabeceras, null, 1),
        clave_env: f.clave_env ?? "", clave_en: f.clave_en ?? "", clave_nombre: f.clave_nombre ?? "",
        mapeo_campos: JSON.stringify(f.mapeo_campos, null, 1), activa: f.activa,
      }
    : VACIA;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Fuentes</h1>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm">No hay fuentes. Añade la primera abajo (tras calificarla con <code>/calificar-fuentes</code>).</p>
      ) : (
        <table className="w-full border-collapse bg-white text-left text-sm">
          <thead><tr className="border-b border-zinc-300">
            <th className="p-2">Nombre</th><th className="p-2">URL</th><th className="p-2">Clave (variable)</th><th className="p-2">Estado</th><th className="p-2" />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.nombre} className="border-b border-zinc-200">
                <td className="p-2">{r.nombre}</td>
                <td className="p-2 break-all">{r.url}</td>
                <td className="p-2">{r.clave_env ?? "sin clave"}</td>
                <td className="p-2">{r.activa ? "activa" : "apagada"}</td>
                <td className="p-2"><Link href={`/fuentes?editar=${encodeURIComponent(r.nombre)}`} className="underline">Editar</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Formulario key={valores.nombre || "nueva"} valores={valores} />
      {f && <Link href="/fuentes" className="text-sm underline">Nueva fuente en blanco</Link>}
    </div>
  );
}
