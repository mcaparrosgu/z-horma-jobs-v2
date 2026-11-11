// Límite de intentos FALLIDOS de entrada por IP (B4-7). Complementa el bloqueo por cuenta (auth.ts): frena probar
// contraseñas contra muchas cuentas desde un mismo sitio, y que alguien bloquee cuentas ajenas sin coste.
//
// La IP solo existe si hay un proxy de confianza delante (HORMA_PROXY_CONFIABLE=1): la cabecera X-Forwarded-For la puede
// escribir cualquiera, así que sin proxy propio no se usa (de lo contrario se evadiría el límite cambiando la cabecera, o se
// metería a todo el mundo en un mismo cubo). Con el proxy activo se toma el ÚLTIMO elemento: el que añadió él, no el cliente.
// Hoy la web solo acepta localhost (host.ts): sin proxy, este límite no actúa y queda el bloqueo por cuenta.
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { Bd } from "./acceso.ts";

export const MAX_FALLOS_IP = 20;
export const VENTANA_IP_MINUTOS = 15;
/** Altas por IP en la ventana (cuenta cada intento, salga bien o mal): más holgado que los fallos de login para no bloquear una clase o una oficina que comparten IP. */
export const MAX_REGISTROS_IP = 30;

/** La IP del cliente según el proxy de confianza, o null si no hay proxy declarado o la cabecera no es una IP válida. */
export function ipDelCliente(
  xForwardedFor: string | null | undefined,
  confiable = process.env.HORMA_PROXY_CONFIABLE === "1",
  sal = process.env.HORMA_IP_SAL ?? "",
): string | null {
  // Sin sal secreta no se guarda nada: un hash de IP sin sal se revierte por fuerza bruta (solo hay ~4.300 M de IPv4).
  if (!confiable || sal.length < 16 || !xForwardedFor) return null;
  const ultimo = xForwardedFor.split(",").pop()?.trim() ?? "";
  return isIP(ultimo) ? agruparIpv6(ultimo) : null;
}

/**
 * Una IPv6 se agrupa por su /64 (los primeros 4 grupos): una casa o una empresa recibe un /64 entero y, si no, bastaría
 * rotar dentro de él para evadir el límite. Una IPv4 (o una IPv6 «mapeada» a IPv4, ::ffff:1.2.3.4) se deja como está.
 */
export function agruparIpv6(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const v4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1];
  const [izq, der] = ip.split("::");
  const a = izq ? izq.split(":") : [];
  const b = der === undefined ? [] : der ? der.split(":") : [];
  const grupos = der === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return `${grupos.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** Aviso para el arranque: proxy declarado pero sal ausente o corta = el límite por IP se apaga sin que nadie lo note. */
export function avisoConfigIp(
  confiable = process.env.HORMA_PROXY_CONFIABLE === "1",
  sal = process.env.HORMA_IP_SAL ?? "",
): string | null {
  if (confiable && sal.length < 16) {
    return "AVISO: HORMA_PROXY_CONFIABLE=1 pero HORMA_IP_SAL falta o tiene menos de 16 caracteres: el límite de intentos por IP está APAGADO.";
  }
  return null;
}

/** HMAC de «ámbito + IP» con la sal secreta (HORMA_IP_SAL): en la base no se guarda la IP ni un hash reversible. */
export const claveIp = (ambito: string, ip: string, sal = process.env.HORMA_IP_SAL ?? "") =>
  createHmac("sha256", sal).update(`${ambito}|${ip}`).digest("hex");

export const SQL_LIMPIAR_INTENTOS = "DELETE FROM intentos_ip WHERE ventana_inicio < now() - interval '1 hour'";
export const SQL_CONSULTAR_INTENTOS = "SELECT fallos FROM intentos_ip WHERE clave = $1 AND ventana_inicio > now() - make_interval(mins => $2)";
export const SQL_ANOTAR_FALLO = `
  INSERT INTO intentos_ip (clave, fallos, ventana_inicio) VALUES ($1, 1, now())
  ON CONFLICT (clave) DO UPDATE SET
    fallos = CASE WHEN intentos_ip.ventana_inicio <= now() - make_interval(mins => $2) THEN 1 ELSE intentos_ip.fallos + 1 END,
    ventana_inicio = CASE WHEN intentos_ip.ventana_inicio <= now() - make_interval(mins => $2) THEN now() ELSE intentos_ip.ventana_inicio END`;

/** ¿Esta IP ya agotó sus fallos en la ventana? Sin IP (sin proxy de confianza) nunca bloquea. */
export async function ipBloqueada(bd: Bd, ambito: string, ip: string | null, maximo = MAX_FALLOS_IP): Promise<boolean> {
  if (!ip) return false;
  await bd.query(SQL_LIMPIAR_INTENTOS);
  const r = await bd.query(SQL_CONSULTAR_INTENTOS, [claveIp(ambito, ip), VENTANA_IP_MINUTOS]);
  return Number(r.rows[0]?.fallos ?? 0) >= maximo;
}

/** Solo cuentan los fallos: un acierto no los borra (si no, quien tenga una cuenta propia reiniciaría el contador). */
export async function anotarFalloIp(bd: Bd, ambito: string, ip: string | null): Promise<void> {
  if (!ip) return;
  await bd.query(SQL_LIMPIAR_INTENTOS); // también aquí: así ninguna fila vive más de ~1 h aunque nadie consulte
  await bd.query(SQL_ANOTAR_FALLO, [claveIp(ambito, ip), VENTANA_IP_MINUTOS]);
}
