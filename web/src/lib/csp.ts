// Política de seguridad de contenido (CSP) estricta, con un nonce distinto por petición (lo genera `proxy.ts`).
// Pura y sin acceso a la petición, para poder probarla con `npm test`.

/** Nonce aleatorio de 128 bits en base64: imprevisible y distinto en cada petición. */
export function nuevoNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}

/**
 * Qué se permite y por qué:
 * - script-src: solo lo propio y lo que lleve el nonce de esta petición; `strict-dynamic` deja que esos scripts carguen
 *   los suyos. `'unsafe-eval'` SOLO en desarrollo (React lo usa para reconstruir errores); nunca en producción.
 * - style-src con `'unsafe-inline'`: la web usa `style={{ width }}` en las barras del panel; Next/Tailwind no necesitan más.
 *   Es la única apertura (el riesgo de estilos en línea es bajo comparado con el de scripts).
 * - img-src con `data:`; connect-src solo propio; sin objetos, sin `<base>` ajeno, formularios y marcos solo propios.
 */
export function construirCsp(nonce: string, desarrollo = false): string {
  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directivas.join("; ");
}
