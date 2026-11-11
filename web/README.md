# web/ — Pista B (en marcha)

La web (**Next.js** + PostgreSQL, PWA) se construye **sin ningún LLM dentro** y en paralelo a la pista A (`.claude/`). **En construcción** (estado en `docs/estado.md`). Desde el 4-nov-2026 el profesor sustituye FastAPI por Next.js; los agentes, scripts y evals de la pista A siguen en Python.

**Primero** (instrucción del profesor, 4-nov): la web de **ingesta de ofertas** y la de **candidatos**, con un **dashboard** para ver el flujo agéntico (pipelines o workflows) y **observabilidad en cada componente**. Después, el resto de la web. Las pruebas se hacen y se pasan a mano.

Orden previsto (documento del profesor, apartado «Pista B», pendiente de adaptar a Next.js):

1. Terreno: carpetas, secretos fuera del código, Docker Compose, CI y escaneo de secretos.
2. Base de datos: tablas que traducen los ocho esquemas de `esquemas-horma`, migraciones, roles de mínimo privilegio, seguridad por filas y su test «leer datos de otra usuaria falla».
3. Rutas de API por capas, tipos generados desde los esquemas, identidad (Google OAuth y email), JWT y CSRF.
4. Importador que lee `datos/` y lo carga como seed.
5. Pantallas sobre el seed: ingesta de ofertas y candidatos, dashboard del flujo, y después tablero, ofertas recomendadas, perfil y preferencias.
6. Cola y worker con `AgentRunner` (`FileAgentRunner`). Dónde corre el worker con Next.js: por decidir.
7. Puerta única al LLM vacía (reintentos, tiempos límite, métricas, guardrails).
8. PWA, texto escapado y CSP estricta.

Instalar dependencias o servicios (Docker, PostgreSQL, Next.js) se decide antes con Mar: qué son, cuánto cuestan y qué mantenimiento añaden.

## Cómo arrancar
```
cd web
cp .env.example .env     # pon una contraseña propia en HORMA_DB_PASSWORD
docker compose up -d       # base de datos horma-db (puerto 5433)
npm install
npm run migrar           # aplica db/migraciones/
npm test                 # pruebas del validador
npm run dev               # la web en http://localhost:3000
```
