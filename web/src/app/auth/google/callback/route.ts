// Segundo paso de «Entrar con Google»: Google devuelve aquí a la usuaria con un código de un solo uso.
// Se comprueba el `state` (contra falsificación de petición), se cambia el código por el id_token con el secreto del
// cliente y el verificador PKCE, y se validan emisor, destinatario, caducidad, nonce y correo verificado.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GOOGLE_TOKEN, iguales, leerIdToken, validarClaimsGoogle } from "@/lib/auth";
import { entrarConGoogle } from "@/lib/acceso";
import { db } from "@/lib/db";
import { COOKIE_OAUTH, googleActivo, googleCredenciales } from "@/lib/google";
import { crearSesion, sesionActual, url_base } from "@/lib/sesion";
import { registrarEvento } from "@/lib/importar";

export async function GET(request: Request) {
  const t0 = Date.now();
  const base = new URL(url_base());
  const fallo = (clave = "google") => NextResponse.redirect(new URL(`/entrar?error=${clave}`, base));
  const apunte = (ok: boolean) =>
    registrarEvento(db(), { componente: "web-acceso", accion: "entrar-google", resultado: ok ? "ok" : "error", duracion_ms: Date.now() - t0 }).catch(() => {});

  const jar = await cookies();
  const guardado = jar.get(COOKIE_OAUTH)?.value ?? "";
  jar.delete({ name: COOKIE_OAUTH, path: "/auth/google" }); // de un solo uso, salga bien o mal
  const [estado, verificador, nonce, modo] = guardado.split(".");
  const q = new URL(request.url).searchParams;
  const code = q.get("code"), recibido = q.get("state");

  if (!googleActivo() || !estado || !verificador || !nonce || !code || !recibido || code.length > 2048 || !iguales(recibido, estado)) {
    await apunte(false);
    return fallo();
  }

  try {
    const { clientId, clientSecret } = googleCredenciales();
    const r = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code",
        redirect_uri: new URL("/auth/google/callback", base).toString(), code_verifier: verificador,
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!r.ok) throw new Error("token");
    const cuerpo = (await r.json()) as { id_token?: unknown };
    const v = validarClaimsGoogle(leerIdToken(cuerpo.id_token), { clientId, nonce, ahoraSeg: Math.floor(Date.now() / 1000) });
    if (!v.ok) throw new Error("claims");

    if (modo === "v") {
      // Vincular: solo con la sesión abierta y solo si el correo de Google es el de ESTA cuenta. Así quien robe una sesión no puede
      // dejarse su propio Google como puerta permanente. La cuenta conserva su rol (administración sigue siéndolo).
      const s = await sesionActual();
      if (!s || s.email !== v.email) { await apunte(false); return NextResponse.redirect(new URL("/", base)); }
      const r2 = await db().query("UPDATE cuentas SET google_sub = $2 WHERE usuaria_id = $1 AND google_sub IS NULL", [s.usuaria_id, v.sub]).catch(() => null);
      await apunte(!!r2 && r2.rowCount === 1);
      return NextResponse.redirect(new URL(r2 && r2.rowCount === 1 ? "/?google=vinculado" : "/?google=error", base));
    }

    const cliente = await db().connect(); // la cuenta nueva se crea en una transacción
    let entrada;
    try { entrada = await entrarConGoogle(cliente, v.sub, v.email); } finally { cliente.release(); }
    if (!entrada.ok) { await apunte(false); return fallo("cuenta"); }
    await crearSesion(entrada.usuaria_id);
    await apunte(true);
    return NextResponse.redirect(new URL("/", base));
  } catch {
    // Nunca se registra el motivo detallado: podría llevar fragmentos del token o del correo.
    await apunte(false);
    return fallo();
  }
}
