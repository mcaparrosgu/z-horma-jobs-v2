import { Suspense } from "react";
import { requerirSesionEmpresa } from "@/lib/sesion-empresa";
import { publicarOferta } from "../actions";
import { FormularioOferta, VALORES_VACIOS } from "../formulario";

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando…</p>}><Nueva /></Suspense>;
}

async function Nueva() {
  await requerirSesionEmpresa();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Publicar una oferta</h1>
        <p className="text-sm text-zinc-600">
          Tu oferta queda <strong>en revisión</strong> y no la ve ninguna candidata hasta que Horma la aprueba.
          Horma nunca ordena ni filtra candidatas para ti: solo ellas decidirán si te escriben.
        </p>
      </div>
      <FormularioOferta accion={publicarOferta} valores={VALORES_VACIOS} textoBoton="Enviar a revisión" />
    </div>
  );
}
