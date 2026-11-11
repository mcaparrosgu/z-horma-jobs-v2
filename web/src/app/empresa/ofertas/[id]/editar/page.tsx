import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requerirSesionEmpresa } from "@/lib/sesion-empresa";
import { SQL_OFERTA_PROPIA, ETIQUETA_PUBLICACION } from "@/lib/empresa-oferta";
import { editarOferta } from "../../actions";
import { FormularioOferta, type ValoresOferta } from "../../formulario";

type Fila = {
  id: string; titulo: string; descripcion: string | null; ubicacion: string; remoto: string; contrato: string;
  idioma: string; nivel: string; sector: string | null; familia: string | null;
  requisitos: string[]; salario: { publicado: boolean; min: number | null; max: number | null; periodo?: string | null };
  avisos: { tipo: string; texto: string }[]; estado_publicacion: string; empresa_id: string | null;
};

export default function Pagina({ params }: PageProps<"/empresa/ofertas/[id]/editar">) {
  return <Suspense fallback={<p className="text-sm">Cargando…</p>}><Editar params={params} /></Suspense>;
}

async function Editar({ params }: { params: PageProps<"/empresa/ofertas/[id]/editar">["params"] }) {
  const { id } = await params;
  const s = await requerirSesionEmpresa();
  const r = await db().query<Fila>(SQL_OFERTA_PROPIA, [id]);
  const o = r.rows[0];
  if (!o || o.empresa_id !== s.empresa_id) notFound(); // no existe, o es de otra empresa

  if (o.estado_publicacion === "cerrada") {
    return <p className="rounded border border-zinc-200 bg-white p-3 text-sm">Esta oferta está cerrada y no se puede editar.</p>;
  }

  const valores: ValoresOferta = {
    titulo: o.titulo, descripcion: o.descripcion ?? "", ubicacion: o.ubicacion, remoto: o.remoto, contrato: o.contrato,
    idioma: o.idioma, nivel: o.nivel, sectorFamilia: o.sector && o.familia ? `${o.sector}::${o.familia}` : "",
    requisitos: o.requisitos.join("\n"), salarioPublicado: o.salario.publicado,
    salarioMin: o.salario.min != null ? String(o.salario.min) : "", salarioMax: o.salario.max != null ? String(o.salario.max) : "",
    salarioPeriodo: o.salario.periodo ?? "anual", avisos: o.avisos,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Editar oferta</h1>
        <p className="text-sm text-zinc-600">
          Estado actual: {ETIQUETA_PUBLICACION[o.estado_publicacion] ?? o.estado_publicacion}.
          {(o.estado_publicacion === "aprobada" || o.estado_publicacion === "rechazada") && " Al guardar, vuelve a revisión."}
        </p>
      </div>
      <FormularioOferta accion={editarOferta} valores={valores} ofertaId={o.id} textoBoton="Guardar cambios" />
    </div>
  );
}
