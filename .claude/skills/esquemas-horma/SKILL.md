---
name: esquemas-horma
description: Contrato de datos de Horma (los nueve esquemas JSON que cruzan entre agentes y, después, entre agentes y web). Cárgala siempre que produzcas o leas oferta, perfil, preferencias, match, candidatura, calificación de fuente o endpoints.
---

# esquemas-horma

Única fuente de verdad de los datos. La web los traduce a Pydantic y a tablas; no los redefine.

| Esquema | Archivo | Lo produce |
|---|---|---|
| Oferta | `schemas/oferta.json` | extractor-oferta, auditor-oferta, clasificador-oferta |
| Perfil | `schemas/perfil.json` | extractor-perfil, clasificador-candidato |
| Preferencias | `schemas/preferencias.json` | extractor-perfil; la usuaria las edita |
| CV base (hasta 4 por sector: `cv_md` + `traza` + `cambios_propuestos`) | `schemas/cv-base.json` | generador-cv-base |
| Match | `schemas/match.json` | matcher |
| Candidatura (estado + traza + huecos + ats) | `schemas/candidatura.json` | flujos D y E |
| Calificación de fuente | `schemas/calificacion-fuente.json` | auditor-fuentes |
| Endpoints | `schemas/endpoints.json` | el equipo; lo lee `/ingestar-ofertas` |
| Clasificación de respuesta | `schemas/clasificacion-respuesta.json` | clasificador-respuesta |

## Reglas

- **Un dato sin origen no existe.** Todo dato de perfil, CV o carta lleva `origen`:

```json
{
  "texto": "Lideré la migración a microservicios de la plataforma de pagos",
  "origen": { "archivo": "cv-2025.pdf", "fragmento": "Migración a microservicios (pagos), 2023-2024", "linea": 42 }
}
```

- Los cuatro archivos de una candidatura (`estado.json`, `traza.json`, `huecos.json`, `ats.json`) son las partes de `candidatura.json`. La carta tiene su propia traza: `traza-carta.json`.
- Valida siempre la salida antes de escribirla: `python -I .claude/skills/esquemas-horma/scripts/validar.py <esquema> <archivo.json>` (subconjunto de JSON Schema, solo biblioteca estándar). Un subagente con solo `Read` **no carga skills solo**: el comando le pasa las rutas de los esquemas; si no valida, una segunda vuelta y, si sigue mal, se anota el error y no se escribe.
- Un cambio de esquema es un cambio de contrato: se anota antes en `CHANGELOG.md`.
