---
name: buscar-ofertas
description: Filtro duro y pre-orden de ofertas por taxonomía, en código, sin embeddings ni LLM. Úsala en /recomendar antes del matcher.
---

# buscar-ofertas

Horma no hace búsqueda semántica ni RAG: la taxonomía compartida y el filtro duro reducen la lista **en código**; el LLM solo puntúa tandas pequeñas.

    python -I .claude/skills/buscar-ofertas/scripts/buscar.py \
      --preferencias datos/usuarias/<u>/preferencias.json \
      --perfil datos/usuarias/<u>/perfil.json \
      --ofertas datos/ofertas/procesadas --salida datos/matches/<u>/orden.json

## Filtro duro
País, contrato, remoto, idioma, nivel, sector y sueldo mínimo, leídos de `preferencias.json`.

- Lo que la oferta no dice (`no_indicado`, nulo) **no descarta**.
- Una oferta **sin sueldo no se descarta**: sale con `sin_sueldo: true`.
- Una oferta que la auditoría marcó como **posible fraude** (`auditoria.fraude.sospechosa`) **se descarta** (orden de Mar, 10-nov); la web también la oculta.

## Pre-orden
Coincidencia de taxonomía entre perfil y oferta (sector 3, familia 3, nivel 2, +1 por tecnología común) y, a igualdad, fecha más reciente. **No descarta nada**: solo decide el turno. En la web es la misma consulta SQL.

Eval: `python -I evals/correr_evals.py filtro`.
