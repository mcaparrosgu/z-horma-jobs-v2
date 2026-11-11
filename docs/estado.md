# Estado de Horma jobs

Última actualización: 11-nov-2026. Fuente de verdad: `docs/flujo-agentico.md`. Historia anterior: repo `z-horma-jobs-v1` (etiqueta `archivo-2026-11-11`).

## Hecho (v1)
- **Pista A** (`.claude/`): agentes, skills y comandos; 52 evals en código.
- **Pista B** (`web/`): ingesta con panel, perfil, recomendaciones, candidatura, aprobar y enviar, seguimiento, portal de empresas, cuenta y RGPD. 247 tests, migraciones hasta la 036.
- Análisis de ofertas en código (skill `analisis-ofertas`).

## Ingesta de prueba (11-nov)
`/ingestar-ofertas` con Feina Activa: 50 de 50 ofertas válidas en `datos/ofertas/procesadas/` (17 sospechosas de fantasma, 0 de fraude). `/recomendar ana-datos`: 23 con nota, 27 «sin nota». Tras corregir ATS y nota (catalán, «anys», meses, experiencia medida en el puesto del título): 48 con nota, 2 sin nota; 26 de 48 se basan en 1-2 requisitos («poco fiable» en `/recomendar`). 54 evals. Detalle en `datos/ofertas/ejecuciones/2026-11-11.json`.

## Siguiente
0. Decidir si el esquema de oferta gana campos (jornada, funciones, periodo salarial, requisitos estructurados) y topes de longitud (`maxLength` en título, requisitos y `motivos`).
0b. Pendiente (línea roja, ya existía): el ATS no descarta requisitos prohibidos («Menor de 30 años», «certificado de discapacidad»).
0c. Web: mostrar «basada en N requisitos · poco fiable» junto a la nota.
1. Portar el análisis de ofertas a TypeScript para la web (contrato: `evals/recomendacion/golden-analisis.json`).
2. Construir la entrevista del perfil (tronco).
3. Plantillas de CV (3-4, aptas para ATS).
4. Ordenar ofertas por frescura.
5. Más fuentes de España (calificar con `/calificar-fuentes` antes de usarlas).

## Preguntas abiertas
- Profesor: ¿se retiran `clasificador-oferta` y `matcher` al hacer el análisis en código? ¿LangGraph sí o no?
- Mar: plazo de conservación de datos (privacidad).

## Antes de abrir a usuarias reales
Verificación de correo y recuperar contraseña; límite por IP en login y registro; dominio propio y cookie `__Host-`; probar Google con credenciales reales; texto de privacidad revisado.

## Ramas
Minijuegos, tiendas de apps, servidor MCP. El envío automático con supervisor es **tronco** (Mar, 11-nov): sigue por construir.

## Artefactos (11-nov)
Cuatro páginas, no más. Mar: [Horma por dentro](https://claude.ai/artifact/QBkk83ZVbjHC97kNq1y9xH), [Pruebas de Horma a mano](https://claude.ai/artifact/AeDdEVZyd7y4xi4mHe7nYY) y [Pruebas de agentes por consola](https://claude.ai/artifact/DQozj1WyoRq9cdQNrDNojz). Profesor: [Resumen al día](https://claude.ai/artifact/8BcKjspjFCDtNoTB7xVFL2) y su [Flujo agéntico](https://claude.ai/artifact/UEWjpE1r4f6L9mZQVpQKvq) (solo lectura).
