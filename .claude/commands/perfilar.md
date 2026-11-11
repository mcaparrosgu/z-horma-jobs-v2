---
description: Convierte uno o varios CV en perfil, CV maestro, preferencias y CV base (Flujo B)
argument-hint: <usuaria> <archivos…>
---

Usuaria: $0 · Archivos: el resto de $ARGUMENTS
**Antes de nada:** comprueba que cada identificador recibido (usuaria, oferta, fuente) cumple `^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$`; el de la **usuaria** además va **en minúsculas** (`^[a-z0-9_-][a-z0-9_.-]{0,79}$`, como en la base de datos y en su carpeta de Windows); si no, para y dilo. Pon siempre las rutas entre comillas.

**Avisos de los agentes (`problemas`):** un agente puede devolver, junto a su JSON, una clave `problemas` (lista de textos). Los esquemas no la admiten: antes de validar y de escribir ningún archivo, quítala del JSON, anótala en el resumen de la ejecución y muéstrasela a la usuaria; los avisos de un agente no se pierden ni se esconden.


1. Para cada archivo, ejecuta `python -I .claude/skills/convertir-cv/scripts/convertir_cv.py <archivo> datos/usuarias/$0/fuentes/`. Si falta `pypdf`, para y dilo (no instales nada).
2. Lanza `extractor-perfil` con todos los textos y sus nombres de archivo. Escribe `cv-maestro.md`, `perfil.json` y `preferencias.json` en `datos/usuarias/$0/`. Valida cada archivo con `python -I .claude/skills/esquemas-horma/scripts/validar.py <esquema> <archivo>`; si no valida, vuelve a lanzar el agente con la lista de errores (una vez).
3. Lanza `clasificador-candidato` sobre `perfil.json` y guarda el resultado.
4. Muestra a la usuaria las `preguntas_pendientes` y espera sus respuestas antes de seguir; con cada respuesta, actualiza el maestro y el perfil. **Pide siempre los meses** de las fechas que traigan solo el año (formato `MM/AAAA`); si ella no los recuerda, se queda el año. Los meses los pone ella: nunca los inventes con datos reales.
5. Lanza `generador-cv-base` (una sola vez, hasta 4 CV; pásale la ruta `.claude/skills/esquemas-horma/schemas/cv-base.json`). Antes de escribir nada, guarda su salida (sin `problemas`) en un archivo temporal y valídala con `python -I .claude/skills/esquemas-horma/scripts/validar.py cv-base <archivo>`; si no valida, vuelve a lanzar el agente con la lista de errores (una vez). Para cada uno escribe `cv-base/<sector>/cv.md` y `cv-base/<sector>/traza.json`, donde `<sector>` es **solo** el `sector` ya validado con los espacios cambiados por guiones (`administracion y finanzas` → `administracion-y-finanzas`); si la validación falla, no escribas nada. Ejecuta `python -I .claude/skills/verificar-trazabilidad/scripts/verificar.py datos/usuarias/$0/cv-base/<sector> --maestro datos/usuarias/$0/cv-maestro.md --perfil datos/usuarias/$0/perfil.json`. Si falla, regenera con la lista de errores; dos intentos como máximo; si siguen fallando, para y avisa a la usuaria de que ese CV base no está verificado: no se da por bueno ni se usa (no lo borres tú; decide ella).
6. Muestra los `cambios_propuestos` de cada CV base: la usuaria aprueba o rechaza. Si un cambio aprobado exige texto nuevo, no edites `cv.md` a mano: regenera ese CV con el cambio y vuelve a pasar `verificar.py` (nunca queda texto sin traza).
7. Recuerda que el CV estético lo sube ella (`cv-estetico.pdf`) y Horma no lo toca.
