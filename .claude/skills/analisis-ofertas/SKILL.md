---
name: analisis-ofertas
description: Clasifica una oferta (sector, familia, stack) y la puntúa contra el perfil (nota, condiciones, explicación) en código, sin LLM. Úsala en /ingestar-ofertas y /recomendar.
---

# analisis-ofertas

Indicación del profesor (10-nov-2026): las ofertas se analizaban dos veces con agentes (categorizar y puntuar contra el CV) y se podía hacer determinista. Esta skill lo hace en código. Sustituye a `clasificador-oferta` y `matcher`; la web (sin LLM) usará la misma lógica.

    python -I .claude/skills/analisis-ofertas/scripts/analizar.py clasificar --ofertas datos/ofertas/procesadas
    python -I .claude/skills/analisis-ofertas/scripts/analizar.py puntuar \
      --perfil datos/usuarias/<u>/perfil.json --preferencias datos/usuarias/<u>/preferencias.json \
      --ofertas datos/ofertas/procesadas --orden datos/matches/<u>/orden.json \
      --salida datos/matches/<u>/<fecha>.json [--rango 60-100]

Las reglas están en `reglas.json` (palabras clave por familia, tecnologías, idiomas, términos prohibidos). **Se amplían a mano** cuando una oferta sale sin familia; no se inventan categorías.

## Qué hace
- **clasificar:** familia por palabras clave (3 puntos si está en el título, 1 si en requisitos o descripción; hace falta ≥ 3 y ganar con claridad, si no `null`); el sector sale de la familia; el stack son las tecnologías que el texto nombra tal cual. No toca `nivel` (lo fija `extractor-oferta`, solo si la oferta lo dice).
- **puntuar:** `nota` = % de requisitos cubiertos por el perfil (los «se valora» pesan la mitad). Mide idiomas (con nivel; también sus nombres en catalán, en `idiomas_otros_nombres`), años o meses de experiencia («anys», «mesos»; se comparan en meses: del perfil se lee el mes si la fecha lo trae, «03/2020» o «2020-03», y si solo trae el año se cuentan años de calendario), tecnologías y palabras significativas. Si la experiencia pedida no dice en qué, se mide en el puesto del título de la oferta y la explicación lo dice («…, como <puesto>»); lo que no se puede medir no cuenta. Sin requisitos, `nota: null`. `nivel_condiciones` = país, modalidad, ciudad, contrato, idioma y sueldo frente a las preferencias (0 fallos `encaja`, 1 `parcial`, 2 o más `no`; lo que no se dice no penaliza). La explicación es una plantilla con datos reales.

## Líneas rojas en el código
- No lee `avisos` ni `respuestas` del perfil ni evidencias del perfil humano.
- Un requisito que habla de edad, género, nacionalidad, salud, estado civil o personalidad (en castellano o catalán) se ignora y no se cita. Un título así no se usa para medir la experiencia.
- Nunca deduce el sector del nombre de la empresa (solo mira título, requisitos y descripción).
- Puntúa ofertas para la candidata; nunca candidatas para empresas.

## Límites conocidos
No entiende sinónimos que no estén en `reglas.json` ni redacción rara. El «tema» se compara por las 5 primeras letras de cada palabra y basta la mitad: «operario» casa con «operaciones» (falso positivo) y un título en catalán puede no casar con un cargo en español (falso 0). Lo mide el eval: `python -I evals/correr_evals.py analisis_ofertas`.
