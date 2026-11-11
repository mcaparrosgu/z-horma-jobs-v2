import Link from "next/link";
import { sesionActual } from "@/lib/sesion";
import { googleActivo } from "@/lib/google";
import { salir } from "./entrar/actions";

// La barra cambia según quién entra: la administración ve todo el panel; cada usuaria, solo lo suyo.
export async function Nav() {
  const s = await sesionActual();
  return (
    <nav className="flex flex-wrap items-center gap-6 border-b border-zinc-200 bg-white px-6 py-3 text-sm font-medium">
      <span className="font-semibold">Horma</span>
      {s && (
        <>
          <Link href={s.rol === "admin" ? "/" : `/candidatos/${s.publico}`}>{s.rol === "admin" ? "Panel" : "Mi perfil"}</Link>
          <Link href="/ofertas">Ofertas</Link>
          <Link href={`/recomendaciones/${s.publico}`}>Recomendaciones</Link>
          <Link href={`/candidaturas/${s.publico}`}>Candidaturas</Link>
          <Link href="/seguimiento">Seguimiento</Link>
          <Link href="/cuenta">Mi cuenta</Link>
          {s.rol === "admin" && (
            <>
              <Link href="/fuentes">Fuentes</Link>
              <Link href="/ejecuciones">Ejecuciones</Link>
              <Link href="/candidatos">Candidatas</Link>
              <Link href="/admin/ofertas-empresas">Ofertas de empresas</Link>
              <Link href="/salud">Salud</Link>
            </>
          )}
          <form action={salir} className="ml-auto flex items-center gap-3">
            {s.rol === "admin" && <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-white">Administración</span>}
            <span className="font-normal text-zinc-500">{s.email}</span>
            {googleActivo() && !s.google && <a href="/auth/google?vincular=1" className="font-normal underline">Vincular Google</a>}
            <button className="underline">Salir</button>
          </form>
        </>
      )}
    </nav>
  );
}
