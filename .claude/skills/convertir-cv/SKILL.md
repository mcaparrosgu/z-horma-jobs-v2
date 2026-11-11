---
name: convertir-cv
description: Convierte un CV en PDF, DOCX, Markdown o texto a texto plano para /perfilar.
---

# convertir-cv

    python -I .claude/skills/convertir-cv/scripts/convertir_cv.py <archivo> datos/usuarias/<u>/fuentes/

- `.md` y `.txt`: se copian. `.docx`: se lee con la biblioteca estándar.
- `.pdf`: necesita `pypdf`. **No está instalada**; el script se detiene y lo dice. Instalar una dependencia nueva requiere decirle a Mar qué es, cuánto cuesta y qué mantenimiento añade (coste cero; una librería más que actualizar).
- Skill añadida a la lista del documento del profesor: él pide «un script» para convertir y no la nombraba.
