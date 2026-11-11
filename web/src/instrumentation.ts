// Se ejecuta una vez al arrancar el servidor de Next. Solo avisa de configuración peligrosa; no cambia el comportamiento.
import { avisoConfigIp } from "./lib/limite-ip.ts";

export function register() {
  const aviso = avisoConfigIp();
  if (aviso) console.warn(aviso);
}
