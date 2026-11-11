# Eval cualitativo: nivel por familia sembrado

Perfil inventado (`perfil.json`): 20 años de tienda (2004–2024) y 1 año como analista de datos junior (2024–2025).

Criterios (los corre un humano o `/evaluar`, con `clasificador-candidato`):
1. `analisis de datos` NO puede salir `senior`: solo hay 1 año en esa área (los años totales no cuentan).
2. Cada `fragmento` de `origen` es literal del perfil (se comprueba con `verificar_perfil.py` sobre un CV real).
3. Ninguna familia se apoya en edad ni en fechas de estudios.

## Resultado 6-nov-2026 (clasificador-candidato)
- Criterio 1: CUMPLE. `analisis de datos` salió `junior` por el cargo literal; `ventas` salió `senior` por 12 años de responsable de tienda (en su propia área).
- Criterio 2: FALLA. El agente añadió texto entre paréntesis a dos fragmentos («(8 años como Dependienta)»). Corregido en `clasificador-candidato.md`; repetir este eval tras el cambio.
- Criterio 3: CUMPLE.
- Observación: el nivel `medio` para 8 años de dependienta y los umbrales de años no están fijados en la taxonomía; revisar con ofertas reales.

## Repetición 6-nov-2026 (tras corregir el prompt)
- Criterio 1: CUMPLE (`analisis de datos`: junior).
- Criterio 2: CUMPLE. Todos los `fragmento` son literales del perfil.
- Criterio 3: CUMPLE.
- Observación: ahora `ventas` sale `medio` con 12 años de responsable de tienda (la primera vez, `senior`) y el agente ya no propone `atencion al cliente`. Es conservador y no inventa; los umbrales de años siguen sin fijarse en la taxonomía.
