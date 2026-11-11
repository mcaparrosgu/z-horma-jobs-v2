// Defensa contra «DNS rebinding»: una web ajena puede hacer que su dominio apunte a 127.0.0.1
// y así hablar con esta web local desde tu navegador. El navegador manda siempre el dominio
// en la cabecera Host; si no es localhost ni 127.0.0.1, se rechaza.
const PERMITIDOS = new Set(["localhost", "127.0.0.1"]);

export function hostPermitido(host: string | null): boolean {
  if (!host) return false;
  const nombre = host.toLowerCase().replace(/:\d{1,5}$/, "");
  return PERMITIDOS.has(nombre);
}
