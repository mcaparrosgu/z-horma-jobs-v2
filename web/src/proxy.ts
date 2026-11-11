// Se ejecuta antes de cada petición (en Next 16 «proxy» sustituye a «middleware»).
// 0) A TODA respuesta le pone una CSP estricta con un nonce nuevo por petición (`lib/csp.ts`). Next lee el nonce de la
//    cabecera de la petición y lo pone en sus propios scripts; las páginas se pintan en cada petición (Suspense + sesión).
// 1) La web solo contesta si se la llama como localhost o 127.0.0.1 (contra DNS rebinding).
// 2) Sin cookie de sesión, todo lo que no sea /entrar o /auth lleva a /entrar. Es solo un filtro «optimista»: la cookie
//    puede estar caducada o inventada. La comprobación de verdad (sesión válida, rol, dueña) la hace cada página y cada acción.
// 3) El portal de empresas (bloque 3) es OTRA identidad, con su propia cookie (`horma_sesion_empresa`, nunca
//    `horma_sesion`): sin ella, todo /empresa/* que no sea /empresa/entrar lleva a /empresa/entrar (no a /entrar).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hostPermitido } from "./lib/host.ts";
import { rutaPublica } from "./lib/rutas.ts";
import { construirCsp, nuevoNonce } from "./lib/csp.ts";

export function proxy(request: NextRequest) {
  const csp = construirCsp(nuevoNonce(), process.env.NODE_ENV === "development");
  // Next extrae el nonce de la CSP de la PETICIÓN para sus scripts; la misma política va en la respuesta al navegador.
  const cabeceras = new Headers(request.headers);
  cabeceras.set("Content-Security-Policy", csp);
  const con = (r: NextResponse) => { r.headers.set("Content-Security-Policy", csp); return r; };
  const seguir = () => con(NextResponse.next({ request: { headers: cabeceras } }));

  if (!hostPermitido(request.headers.get("host"))) {
    return con(new NextResponse("Host no permitido", { status: 403 }));
  }
  const ruta = request.nextUrl.pathname;
  if (ruta.startsWith("/empresa")) {
    if (ruta !== "/empresa/entrar" && !request.cookies.get("horma_sesion_empresa")?.value) {
      return con(NextResponse.redirect(new URL("/empresa/entrar", request.url)));
    }
    return seguir();
  }
  if (!rutaPublica(ruta) && !request.cookies.get("horma_sesion")?.value) {
    return con(NextResponse.redirect(new URL("/entrar", request.url)));
  }
  return seguir();
}

// No se ejecuta sobre los archivos estáticos de Next.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
