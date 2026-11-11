// Listas cerradas y funciones puras del formulario de oferta de empresa (bloque 3), SIN tocar node:fs ni la base:
// este archivo lo importa también el formulario de cliente (formulario.tsx), así que tiene que poder ir al
// navegador. La validación contra el esquema (que sí lee disco) y las consultas SQL viven en empresa-oferta.ts.
export const ID_EMPRESA = /^[a-z0-9][a-z0-9_-]{0,79}$/;

// Mismas listas que consultas.ts (nivel y modalidad): una sola fuente para candidata y empresa.
export const NIVELES_EMPRESA = ["practicas", "junior", "medio", "senior", "direccion"] as const;
export const REMOTOS_EMPRESA = ["presencial", "hibrido", "remoto"] as const;
export const CONTRATOS = ["indefinido", "temporal", "practicas", "formacion", "freelance"] as const;
export const IDIOMAS_TRABAJO = ["español", "inglés", "francés", "alemán", "portugués", "italiano"] as const;
export const PERIODOS_SALARIO = ["anual", "mensual", "hora"] as const;
export const TIPOS_AVISO = ["ciudadania", "habilitacion_seguridad", "residencia_o_permiso", "otro"] as const;

// Taxonomía común (taxonomia-horma/SKILL.md): sector -> familias. La empresa elige de aquí, nunca escribe libre.
export const SECTORES_FAMILIAS: Readonly<Record<string, readonly string[]>> = {
  datos: ["analisis de datos", "ingenieria de datos", "ciencia de datos", "inteligencia artificial"],
  "desarrollo de software": ["desarrollo backend", "desarrollo frontend", "desarrollo full stack", "devops", "calidad y testing", "producto digital"],
  "diseno y creatividad": ["diseno grafico", "diseno de producto", "contenido y redaccion", "audiovisual"],
  "marketing y comunicacion": ["marketing digital", "comunicacion y prensa", "redes sociales", "seo y analitica"],
  "administracion y finanzas": ["administracion", "contabilidad", "finanzas", "compras"],
  "ventas y atencion al cliente": ["ventas", "atencion al cliente", "cuentas clave"],
  "recursos humanos": ["seleccion", "formacion interna", "administracion de personal"],
  sanidad: ["enfermeria", "medicina", "farmacia", "gestion sanitaria"],
  educacion: ["docencia", "formacion", "orientacion"],
  "logistica y operaciones": ["logistica", "almacen", "operaciones", "cadena de suministro"],
  "ingenieria e industria": ["ingenieria industrial", "mantenimiento", "calidad industrial", "construccion"],
  legal: ["asesoria juridica", "cumplimiento normativo"],
};

export const ETIQUETA_PUBLICACION: Record<string, string> = {
  aprobada: "publicada", pendiente_de_revision: "en revisión", rechazada: "rechazada (puedes editarla y reenviarla)", cerrada: "cerrada",
};

/** Separa por líneas, recorta, quita vacíos y duplicados; tope de cantidad y de longitud por línea. */
export function listaDeLineas(s: unknown, maxItems = 30, maxLen = 200): string[] {
  if (typeof s !== "string") return [];
  const vistas = new Set<string>();
  const items: string[] = [];
  for (const linea of s.split("\n")) {
    const t = linea.trim().slice(0, maxLen);
    if (t && !vistas.has(t)) { vistas.add(t); items.push(t); }
    if (items.length >= maxItems) break;
  }
  return items;
}

export type DatosOfertaEmpresa = {
  titulo: string; descripcion: string; ubicacion: string; remoto: string; contrato: string; idioma: string;
  nivel: string; sectorFamilia: string; requisitos: string; salarioPublicado: boolean; salarioMin: string;
  salarioMax: string; salarioPeriodo: string; avisos: { tipo: string; texto: string }[];
};
