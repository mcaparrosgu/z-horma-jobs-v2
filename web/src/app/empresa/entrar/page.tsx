import { Suspense } from "react";
import { redirect } from "next/navigation";
import { sesionEmpresaActual } from "@/lib/sesion-empresa";
import { FormularioEntrarEmpresa } from "./formulario";

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando…</p>}><Entrar /></Suspense>;
}

async function Entrar() {
  if (await sesionEmpresaActual()) redirect("/empresa");
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Entrar como empresa</h1>
      <p className="text-sm text-zinc-600">
        Portal para publicar ofertas en Horma. Toda oferta pasa por revisión antes de aparecer. El alta de empresa
        es solo por ahora a través de Mar (modo piloto): si no tienes cuenta, escríbele.
      </p>
      <FormularioEntrarEmpresa />
    </div>
  );
}
