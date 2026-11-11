---
description: Califica un portal de empleo antes de usarlo como fuente (Flujo A′)
argument-hint: <url>
---

URL: $0

0. La URL tiene que empezar por `https://`; si no, para y dilo.
1. Lee con WebFetch las condiciones de uso y el `robots.txt` del portal (`$0`). Si no los encuentras, dilo: no adivines.
2. Si el dominio es LinkedIn o Indeed: `apta = false` por regla del producto, sin más análisis.
3. Lanza el subagente `auditor-fuentes` con la URL y los textos leídos.
4. Añade o actualiza el resultado en `datos/fuentes/calificacion.json` (lista de objetos con el esquema `calificacion-fuente`).
5. Si `apta = true`, propón (no escribas aún) la fila para `.claude/skills/fuentes-ofertas/endpoints.json` y pide a Mar el nombre de la variable de entorno de la clave. Nunca pidas ni copies la clave.
