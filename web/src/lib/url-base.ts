// La URL pública de Horma, aparte (sin next/headers ni next/navigation): así la pueden importar módulos que se
// prueban con `node --test` sin pasar por el runtime de Next (p. ej. empresa-oferta.ts).
export const url_base = () => process.env.HORMA_URL || "http://localhost:3000";
