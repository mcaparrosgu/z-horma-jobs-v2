import { Suspense } from "react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/sesion";
import { FormularioContrasena, FormularioBorrar } from "./formularios";

type Fila = { tiene_contrasena: boolean; google_vinculado: boolean };
const SQL = "SELECT (hash IS NOT NULL) AS tiene_contrasena, (google_sub IS NOT NULL) AS google_vinculado FROM cuentas WHERE usuaria_id = $1";

export default function Pagina() {
  return <Suspense fallback={<p className="text-sm">Cargando…</p>}><Cuenta /></Suspense>;
}

async function Cuenta() {
  const s = await requerirSesion();
  const r = await db().query<Fila>(SQL, [s.usuaria_id]);
  const f = r.rows[0] ?? { tiene_contrasena: false, google_vinculado: false };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-zinc-600">
          {s.email} · {s.rol === "admin" ? "administración" : "usuaria"}{f.google_vinculado ? " · con Google vinculado" : ""}
        </p>
      </div>

      <section className="space-y-2 rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Descargar mis datos</h2>
        <p className="text-sm text-zinc-600">Un archivo JSON con tu cuenta (sin tu contraseña), tu perfil, tus preferencias, tus recomendaciones, tus candidaturas y tus envíos a empresas.</p>
        <a href="/cuenta/descargar" className="inline-block rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium">Descargar mis datos</a>
      </section>

      {f.tiene_contrasena ? (
        <FormularioContrasena />
      ) : (
        <section className="rounded border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          Entras con Google: no tienes contraseña que cambiar.
        </section>
      )}

      {s.rol === "admin" ? (
        <section className="rounded border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          Las cuentas de administración no se borran desde la web: se borran por terminal.
        </section>
      ) : (
        <FormularioBorrar tieneContrasena={f.tiene_contrasena} email={s.email} />
      )}
    </div>
  );
}
