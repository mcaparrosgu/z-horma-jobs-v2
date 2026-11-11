---
name: medir-ats
description: Mide la cobertura de palabras clave de una oferta en un CV adaptado. Úsala en /candidatura después del juez; nunca para insertar palabras sin origen.
---

# medir-ats

Es código, no juicio. El script extrae las palabras clave de `oferta.json` (`taxonomia.stack` y los `requisitos` de hasta 4 palabras) y cuenta cuáles aparecen en `cv.md`. Se quita el texto entre paréntesis («Inglés B2 (se valora)» → «Inglés B2») y los prefijos de relleno («Conocimientos de Python» → «Python», «Coneixement A3» → «A3»); una clave repetida cuenta una vez.

Salen en `no_medidos`, que se dicen como **no verificados** (nunca como «sin origen»):
- las frases de más de 4 palabras;
- los años o meses de experiencia («2 años», «Experiència 2 anys»): un CV dice fechas, no cifras de años;
- si la oferta declara un idioma distinto del español, sus requisitos: solo se miden las tecnologías del `stack`, que se escriben igual en todos los idiomas. No hay diccionario de traducción.

## Uso

    python -I .claude/skills/medir-ats/scripts/medir_ats.py \
      --cv datos/candidaturas/<u>/<o>/cv.md \
      --oferta datos/ofertas/procesadas/<o>.json \
      --perfil datos/usuarias/<u>/perfil.json \
      --salida datos/candidaturas/<u>/<o>/ats.json

## Salida (`ats.json`)

- `cobertura`: de 0 a 1.
- `faltantes_con_origen[]`: faltan en el CV pero están en el perfil → se sugieren al redactor.
- `faltantes_sin_origen[]`: faltan y no están en el perfil → se avisa a la usuaria, nunca se insertan.

## Regla

Una palabra de `faltantes_sin_origen` no entra al CV bajo ninguna instrucción. El umbral mínimo de cobertura **no está fijado**: se fija con las primeras ejecuciones de `evals/cv/`.

Pendiente de cerrar con el profesor: si esto cuenta como «subagente ATS» del PRD (pregunta 14 bis).
