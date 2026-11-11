// Primer paso de «Entrar con Google»: guarda tres secretos de un solo uso en una cookie y manda a la usuaria a Google.
import { NextResponse, connection } from "next/server";
import { cookies } from "next/headers";
import { aleatorio, desafioPkce, urlGoogle } from "@/lib/auth";
import { COOKIE_OAUTH, googleActivo, googleCredenciales } from "@/lib/google";
import { sesionActual, url_base } from "@/lib/sesion";

export async function GET(request: Request) {
  await connection(); // siempre se calcula en cada petición: nunca se "congela" en la compilación (dependería de las claves de ese momento)
  const base = new URL(url_base());
  if (!googleActivo()) return NextResponse.redirect(new URL("/entrar?error=google", base));
  // Las cookies son por servidor (localhost ≠ 127.0.0.1): se empieza y se termina siempre en la dirección oficial.
  if (request.headers.get("host") !== base.host) return NextResponse.redirect(new URL("/auth/google", base));

  // ?vincular=1: une Google a la cuenta con la sesión abierta (sin sesión no tiene sentido).
  const vincular = new URL(request.url).searchParams.get("vincular") === "1";
  if (vincular && !(await sesionActual())) return NextResponse.redirect(new URL("/entrar", base));

  const estado = aleatorio(), verificador = aleatorio(), nonce = aleatorio();
  (await cookies()).set(COOKIE_OAUTH, `${estado}.${verificador}.${nonce}${vincular ? ".v" : ""}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" || base.protocol === "https:", path: "/auth/google", maxAge: 600,
  });
  return NextResponse.redirect(urlGoogle({
    clientId: googleCredenciales().clientId, redirectUri: new URL("/auth/google/callback", base).toString(),
    estado, desafio: desafioPkce(verificador), nonce,
  }));
}
