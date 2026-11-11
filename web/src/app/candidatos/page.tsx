import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SQL_USUARIAS } from "@/lib/preferencias";
import { requerirSesion } from "@/lib/sesion";

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando candidatas…</p>}><Candidatas /></Suspense>;
}

async function Candidatas() {
  const s = await requerirSesion();
  if (s.rol !== "admin") redirect(`/candidatos/${s.publico}`); // cada usuaria ve solo lo suyo
  const { rows } = await db().query<{ publico: string; soy_yo: boolean; tiene_perfil: boolean }>(SQL_USUARIAS, [s.usuaria_id]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Candidatas</h1>
      <p className="text-sm text-zinc-600">
        Vista de administración: cuántas cuentas hay y si han cargado el perfil. Los datos personales de cada candidata (perfil, recomendaciones, candidaturas) solo los ve ella; aquí tampoco se muestran correos. Las empresas no ven nada de esta sección: Horma no ordena ni filtra candidatas para ellas.
      </p>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm">No hay candidatas. Importa los datos de ejemplo con <code>npm run importar</code>.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {rows.map((u, i) => (
            <li key={u.publico} className="flex items-center justify-between p-3 text-sm">
              <span>{u.soy_yo ? "Tú" : `Cuenta ${i + 1}`}</span>
              {u.soy_yo
                ? <Link href={`/candidatos/${u.publico}`} className="underline">Ver tu perfil</Link>
                : <span className="text-zinc-500">{u.tiene_perfil ? "con perfil" : "sin perfil todavía"}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
