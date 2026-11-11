// Comprueba la contraseña de la base de datos antes de conectar (hallazgo G del revisor).
// Devuelve un texto con el problema, o null si la contraseña es aceptable.
export function problemaClave(clave: string | undefined, nombre = "HORMA_DB_PASSWORD"): string | null {
  if (!clave) return `Falta ${nombre} (usa \`npm run ...\`, que carga web/.env).`;
  if (clave === "cambia-esto") return `${nombre} sigue con el valor de ejemplo: cámbiala en web/.env.`;
  if (clave.length < 16) return `${nombre} es demasiado corta (mínimo 16 caracteres).`;
  return null;
}
