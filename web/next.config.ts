import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // A2 (CSP con nonce): `cacheComponents` y `partialPrefetching` se APAGAN. Con ellos Next prerrenderiza el «cascarón» de cada
  // página en la compilación, sin nonce, y una CSP estricta bloquea sus scripts (probado: 10 violaciones en /entrar y la
  // página sin hidratar). Ninguna página usaba `use cache`; todas son dinámicas (sesión y base de datos).
  // Si se quisiera volver a PPR habría que pasar a la CSP por hashes (SRI, experimental).
  // La CSP completa (incluido frame-ancestors) la pone src/proxy.ts; aquí NO se repite para que no la pise.
  // Contra clickjacking (que otra web incruste esta en un marco) y adivinación de tipos de archivo.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
