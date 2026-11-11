// Rutas que se pueden abrir sin sesión (el proxy las deja pasar). Todo lo demás pide entrar.
export function rutaPublica(ruta: string): boolean {
  return ruta === "/entrar" || ruta === "/auth/google" || ruta === "/auth/google/callback";
}
