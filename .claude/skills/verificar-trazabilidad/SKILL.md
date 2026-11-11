---
name: verificar-trazabilidad
description: Verifica en código que un CV adaptado conserva fechas, cargos, empresas y titulaciones del CV maestro y que cada frase tiene un origen real. Úsala en /candidatura y en cada CV base; un hook la corre al escribir cv.md.
---

# verificar-trazabilidad

Script determinista (`scripts/verificar.py`), sin LLM. Es el guardarraíl que **no depende de la memoria del agente**.

    python -I .claude/skills/verificar-trazabilidad/scripts/verificar.py datos/candidaturas/<u>/<o>

Comprueba:

1. **Fechas:** todo año o mes/año de `cv.md` existe en `cv-maestro.md`.
2. **Cifras:** todo número (porcentajes, importes, cantidades) existe en el maestro.
3. **Encabezados:** `### Cargo · Empresa · inicio–fin` y `### Titulación · Centro · inicio–fin` coinciden con `perfil.json` y con el maestro (el año suelto ya no vale: oculta el inicio).
4. **Traza:** cada `origen.fragmento` existe de verdad en el maestro y cada línea de `cv.md` tiene frase en `traza.json`.

Salida JSON `{ok, errores[]}`; código 1 si hay errores. No juzga inflación de cargos ni promesas de más, ni si el fragmento citado sostiene de verdad la frase: eso lo hace `juez-cv`. Con `--carta` verifica `carta.md` y `traza-carta.json` (sin encabezados).

## Hook

`scripts/hook.py` se configura en `.claude/settings.json` como PostToolUse (**pendiente: hay que añadir el bloque a `.claude/settings.json`; hasta entonces el hook no corre y `/candidatura` ejecuta el verificador a mano**) sobre `Write|Edit`: si lo escrito es el `cv.md` de una candidatura, corre el verificador y, si falla, devuelve los errores al agente en el mismo turno (código de salida 2).

## Eval

`python -I evals/correr_evals.py cv` siembra 7 errores sobre un CV inventado y exige rechazar el 100 %.
