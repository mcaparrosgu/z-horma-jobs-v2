// Datos de UNA usuaria en disco, para exportarlos y borrarlos (RGPD: acceso y supresión).
// Solo toca estas tres carpetas dentro de la carpeta de datos; nunca sigue enlaces simbólicos.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

// Más estricto que el de la base (que admite mayúsculas y puntos): en Windows «Ana» y «ana» son la MISMA carpeta
// y «ana.» también, pero en la base son usuarias distintas. Aquí solo ids que significan lo mismo en disco y en base.
export const ID_USUARIA = /^[a-z0-9_][a-z0-9_-]{0,79}$/;
const RESERVADOS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
export function idValido(id: string): boolean {
  return ID_USUARIA.test(id) && !RESERVADOS.test(id);
}
export const CARPETAS = ["usuarias", "candidaturas", "matches"] as const;

export interface Hallazgo { carpeta: string; archivos: number; bytes: number }

/** Rutas absolutas de las carpetas de la usuaria que EXISTEN. Lanza si el id no es válido. */
export function carpetasDe(raizDatos: string, id: string): { carpeta: string; ruta: string }[] {
  if (!idValido(id)) throw new Error("identificador de usuaria no válido");
  // La ruta siempre queda dentro de raizDatos/CARPETAS/id (nunca es libre): ignora el aviso de Turbopack de que
  // un acceso "dinámico" a disco obligaría a empaquetar todo el proyecto en el despliegue.
  return CARPETAS.map((c) => ({ carpeta: c, ruta: join(/*turbopackIgnore: true*/ raizDatos, c, id) })).filter((x) => existsSync(x.ruta) || enlace(x.ruta));
}

function enlace(ruta: string): boolean {
  try { return lstatSync(ruta).isSymbolicLink(); } catch { return false; }
}

/** Cuenta archivos y bytes; lanza si encuentra un enlace simbólico (no se sigue ni se copia ni se borra). */
function medir(ruta: string): { archivos: number; bytes: number } {
  const st = lstatSync(ruta);
  if (st.isSymbolicLink()) throw new Error("hay un enlace simbólico dentro de los datos: revísalo a mano");
  if (st.isFile()) return { archivos: 1, bytes: st.size };
  if (!st.isDirectory()) throw new Error("hay un archivo especial dentro de los datos: revísalo a mano");
  let archivos = 0, bytes = 0;
  for (const nombre of readdirSync(ruta)) {
    const m = medir(join(ruta, nombre));
    archivos += m.archivos; bytes += m.bytes;
  }
  return { archivos, bytes };
}

/** La carpeta padre (datos/usuarias…) no puede ser un enlace ni sacar la ruta de la carpeta de datos. */
function comprobarDentro(raizDatos: string, carpeta: string, ruta: string): void {
  const padre = join(raizDatos, carpeta);
  if (existsSync(padre) && lstatSync(padre).isSymbolicLink()) throw new Error("una carpeta de datos es un enlace simbólico: revísalo a mano");
  const base = realpathSync(raizDatos);
  if (existsSync(ruta) && !realpathSync(ruta).startsWith(base)) throw new Error("la ruta sale de la carpeta de datos");
}

export function inspeccionar(raizDatos: string, id: string): Hallazgo[] {
  return carpetasDe(raizDatos, id).map(({ carpeta, ruta }) => { comprobarDentro(raizDatos, carpeta, ruta); return { carpeta, ...medir(ruta) }; });
}

/** Copia las carpetas de la usuaria a `destino/<carpeta>`. Devuelve lo copiado. */
export function copiarA(raizDatos: string, id: string, destino: string): Hallazgo[] {
  const hallado = inspeccionar(raizDatos, id); // también comprueba que no hay enlaces
  mkdirSync(destino, { recursive: true });
  for (const { carpeta, ruta } of carpetasDe(raizDatos, id)) cpSync(ruta, join(destino, carpeta), { recursive: true });
  return hallado;
}

/**
 * Borrado en dos tiempos, para que base y disco no queden a medias:
 * 1) `aCuarentena` RENOMBRA las carpetas a datos/.borrando-<id>/ (un rename casi nunca falla a medias);
 * 2) se borra la fila y se confirma; 3) `purgarCuarentena` borra de verdad. Si algo falla antes, `restaurar` lo deshace.
 */
export function aCuarentena(raizDatos: string, id: string): number {
  const hallado = inspeccionar(raizDatos, id); // si hay un enlace, aborta antes de mover nada
  const q = join(raizDatos, `.borrando-${id}`);
  mkdirSync(q, { recursive: true });
  const movidas: { carpeta: string; ruta: string }[] = [];
  try {
    for (const c of carpetasDe(raizDatos, id)) { renameSync(c.ruta, join(q, c.carpeta)); movidas.push(c); }
  } catch (e) { restaurar(raizDatos, id, movidas); throw e; }
  return hallado.reduce((n, h) => n + h.archivos, 0);
}

export function restaurar(raizDatos: string, id: string, movidas?: { carpeta: string; ruta: string }[]): void {
  const q = join(raizDatos, `.borrando-${id}`);
  for (const c of movidas ?? CARPETAS.map((k) => ({ carpeta: k, ruta: join(/*turbopackIgnore: true*/ raizDatos, k, id) }))) {
    if (existsSync(join(q, c.carpeta))) renameSync(join(q, c.carpeta), c.ruta);
  }
  if (existsSync(q)) rmSync(q, { recursive: true });
}

export function purgarCuarentena(raizDatos: string, id: string): void {
  rmSync(join(raizDatos, `.borrando-${id}`), { recursive: true, force: true });
}

export const SQL_EXPORTAR = {
  usuaria: "SELECT to_jsonb(u) AS dato FROM usuarias u WHERE id = $1",
  // La cuenta SIN la contraseña (ni su hash) ni el identificador de Google: solo lo que la usuaria puede entender.
  cuenta: "SELECT jsonb_build_object('email', email, 'rol', rol, 'email_verificado', email_verificado, 'google_vinculado', google_sub IS NOT NULL, 'creada_en', creada_en) AS dato FROM cuentas WHERE usuaria_id = $1",
  perfil: "SELECT to_jsonb(p) AS dato FROM perfiles p WHERE usuaria_id = $1",
  preferencias: "SELECT to_jsonb(p) AS dato FROM preferencias p WHERE usuaria_id = $1",
  matches: "SELECT jsonb_agg(to_jsonb(m)) AS dato FROM matches m WHERE usuaria_id = $1",
  candidaturas: "SELECT jsonb_agg(to_jsonb(c)) AS dato FROM candidaturas c WHERE usuaria_id = $1",
  // Envíos a empresas (bloque 4): sin id interno de la empresa ni nada de la candidatura que no sea lo enviado.
  envios_empresa: "SELECT jsonb_agg(jsonb_build_object('oferta_id', oferta_id, 'cv_md', cv_md, 'carta_md', carta_md, 'contacto_compartido', contacto_nombre IS NOT NULL, 'contacto_nombre', contacto_nombre, 'contacto_email', contacto_email, 'estado_bandeja', estado_bandeja, 'enviado_en', enviado_en)) AS dato FROM envios_empresa WHERE usuaria_id = $1",
} as const;

// Las tablas hijas (cuentas, sesiones, perfiles, preferencias, matches, candidaturas) se borran solas por ON DELETE CASCADE.
// Para la terminal (rol `horma`, sin restricciones): borrado directo.
export const SQL_BORRAR_USUARIA = "DELETE FROM usuarias WHERE id = $1";
// Para la web (rol `horma_web`): la función (migración 016) nunca borra una cuenta de administración y devuelve
// cuántas filas borró (0 si no existía o era de administración). El id siempre sale de la sesión, nunca del formulario.
export const SQL_BORRAR_CUENTA_PROPIA = "SELECT borrar_cuenta_propia($1) AS filas";

/** Ruta relativa para la consola: el nombre de la carpeta de una usuaria (su id) nunca se imprime. */
export function rutaCorta(raiz: string, ruta: string): string {
  return relative(raiz, ruta).replace(/^(perfiles|usuarias|matches|candidaturas)[\\/][^\\/]+/, "$1/(usuaria)");
}
