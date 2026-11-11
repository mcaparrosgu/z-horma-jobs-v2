---
description: Corre los evals de un flujo y deja una ejecución fechada
argument-hint: [ingesta|perfil|recomendacion|cv|respuestas|todo]
---

Flujo: $ARGUMENTS (por defecto, todo)

1. Ejecuta `python -I evals/correr_evals.py` para lo determinista (verificador contra errores sembrados, ATS, filtro duro, esquemas). Muestra el resultado real, fallos incluidos.
2. Para lo cualitativo, recorre las fixtures de `evals/<flujo>/` que existan: lanza el agente del flujo con cada entrada, compara con el valor esperado (código para campos exactos) y, para lo que no se puede comparar en código, pide el veredicto del juez correspondiente.
3. Escribe la ejecución en `evals/resultados/<fecha>-<flujo>.json` y resume frente al umbral de `docs/flujo-agentico.md` (apartado «Evals en la fase 1»). Los umbrales son propuestos; el de cobertura ATS queda por fijar.
4. Si un set no tiene fixtures todavía, dilo en una línea: no inventes resultados.
