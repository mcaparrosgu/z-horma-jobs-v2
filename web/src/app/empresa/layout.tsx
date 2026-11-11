import { Suspense } from "react";
import Link from "next/link";
import { sesionEmpresaActual } from "@/lib/sesion-empresa";
import { salirEmpresa } from "./actions";

// Barra propia del portal de empresas: aparte de la de candidatas (nav.tsx). Una sesión de empresa nunca
// comparte cookie ni tabla con una de usuaria, y esta barra nunca lee nada de perfiles/preferencias/candidaturas.
async function BarraEmpresa() {
  const s = await sesionEmpresaActual();
  if (!s) return null;
  return (
    <nav className="flex flex-wrap items-center gap-4 rounded border border-zinc-200 bg-white px-4 py-2 text-sm">
      <span className="font-semibold">Portal de empresas</span>
      <Link href="/empresa" className="underline">Mis ofertas</Link>
      <Link href="/empresa/ofertas/nueva" className="underline">Publicar oferta</Link>
      <form action={salirEmpresa} className="ml-auto flex items-center gap-3">
        <span className="text-zinc-500">{s.nombre} · {s.email}</span>
        <button className="underline">Salir</button>
      </form>
    </nav>
  );
}

export default function LayoutEmpresa({ children }: LayoutProps<"/empresa">) {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <BarraEmpresa />
      </Suspense>
      {children}
    </div>
  );
}
