---
name: taxonomia-horma
description: Taxonomía común de sectores, familias de puesto y niveles. La usan igual los clasificadores de ofertas y de candidatos, y es lo que hace posible el match. Cárgala al clasificar.
---

# taxonomia-horma

Versión inicial (3-nov-2026), **propuesta a revisar con las primeras ofertas reales**. Los valores se escriben exactamente así (minúsculas, sin tildes). Si nada encaja, `null`: no se inventan categorías nuevas; se anota la carencia y se amplía esta lista a mano.

## Niveles
`practicas`, `junior`, `medio`, `senior`, `direccion`, `no_indicado` (la oferta no dice el nivel: no se deduce). El perfil tiene un nivel general y, opcionalmente, uno por familia (`niveles_por_familia`; `no_indicado` solo vale para ofertas). Es de uso interno para ordenar ofertas para la usuaria: no se muestra a empresas.

## Sectores y familias de puesto

| Sector | Familias |
|---|---|
| `datos` | `analisis de datos`, `ingenieria de datos`, `ciencia de datos`, `inteligencia artificial` |
| `desarrollo de software` | `desarrollo backend`, `desarrollo frontend`, `desarrollo full stack`, `devops`, `calidad y testing`, `producto digital` |
| `diseno y creatividad` | `diseno grafico`, `diseno de producto`, `contenido y redaccion`, `audiovisual` |
| `marketing y comunicacion` | `marketing digital`, `comunicacion y prensa`, `redes sociales`, `seo y analitica` |
| `administracion y finanzas` | `administracion`, `contabilidad`, `finanzas`, `compras` |
| `ventas y atencion al cliente` | `ventas`, `atencion al cliente`, `cuentas clave` |
| `recursos humanos` | `seleccion`, `formacion interna`, `administracion de personal` |
| `sanidad` | `enfermeria`, `medicina`, `farmacia`, `gestion sanitaria` |
| `educacion` | `docencia`, `formacion`, `orientacion` |
| `logistica y operaciones` | `logistica`, `almacen`, `operaciones`, `cadena de suministro` |
| `ingenieria e industria` | `ingenieria industrial`, `mantenimiento`, `calidad industrial`, `construccion` |
| `legal` | `asesoria juridica`, `cumplimiento normativo` |

## Stack
Lista libre de **tecnologías y herramientas** que el texto nombra expresamente, tal como se escriben (`Python`, `SQL`, `Power BI`). **Los idiomas no van en el stack** (van en `idiomas`, con su nivel). No se deduce nada que no esté escrito.

## Reglas
- Las etiquetas del candidato salen de sus experiencias y formación, nunca de rasgos personales.
- Ofertas y candidatos usan **exactamente la misma lista**, o el pre-orden por taxonomía no funciona.
