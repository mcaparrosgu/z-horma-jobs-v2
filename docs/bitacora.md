# Bitácora

Solo decisiones y fallos, 5 líneas como máximo por entrada.

## 11-nov-2026 — Horma empieza de nuevo, limpio
El profesor pidió menos documentación, menos carpetas y un `CLAUDE.md` más corto. Decisión de Mar: repo nuevo con solo lo que funciona; el flujo agéntico del profesor es la única fuente de verdad. El repo anterior queda archivado como `horma-jobs-v1` (bitácora larga incluida).

**En llano:** hemos hecho limpieza general sin tirar nada: el código y las pruebas se han traído; los papeles de trabajo se han quedado en el archivo.

## 11-nov-2026 — Artefactos: de once páginas a cuatro
El profesor dijo que sobraba documentación. El documento «Horma jobs» del Cuaderno pasa de 31 apartados a 12 y se publica como resumen para él; «Horma por dentro» absorbe la guía, el plan de construcción y las fuentes; las dos páginas de pruebas se quedan, al día y con las marcas de Mar intactas. La bitácora larga sigue en `horma-jobs-v1`. Los 28 comentarios del profesor están copiados en `Workbook/web/proyectos/horma/copia-seguridad/`.

**En llano:** menos páginas y más cortas, sin perder lo importante. Mar ha confirmado borrar Construcción, Fuentes de empleo, Guía de Horma y la estrategia legal (su texto completo está en la misma copia de seguridad). Siguen publicadas las tres viejas con comentarios del profesor, hasta que él abra la página nueva.


## 11-nov-2026 — Primera ingesta real: 50 ofertas de Feina Activa
Entraron 50/50, pero el esquema no guarda jornada, funciones ni periodo del salario, y la nota sale de pocos requisitos medibles. Fallo mío: un ejemplo («catalán») en mi prompt sesgó el `idioma` de FA92323912; corregido a mano. Copiar JSON de agente a archivo a mano es caro y no lo detecta el validador.

**En llano:** funciona de punta a punta, pero la ficha de oferta es demasiado pobre para puntuar bien.

## 11-nov-2026 — Prueba 3.6: `/perfilar` no preguntaba por los `cambios_propuestos`
Al probar 3.6 por consola, ningún agente pidió aprobar o rechazar los cambios de los CV base; `cambios_propuestos` no se guarda en disco, así que no se pudo recuperar. Se relanzó `generador-cv-base` para `ana-datos`: Mar aprobó 4 de 5 cambios y rechazó uno, y el CV afectado se regeneró (no se edita a mano). Validan el esquema y `verificar.py`. Pendiente: que el paso 6 de `perfilar.md` pregunte siempre por sí solo.

**En llano:** la lista de cambios solo existe en el momento de generar el CV; si ese paso se salta, ya no hay forma de enseñarla sin volver a generar.

## 11-nov-2026 — ATS y nota corregidos tras probar `/recomendar` y `/candidatura` con ana-datos
No se reconocían «anys», meses ni idiomas en catalán; el ATS marcaba como «sin origen» años y textos en catalán; la frase de «sin nota» era falsa en 26/27. Al medir «anys», «Experiència 1 anys» a secas daba 100 a ana en «Terapeuta ocupacional»: Mar decidió medirla en el puesto del título. Los revisores hallaron que un título con «discapacidad» se usaba y citaba (corregido), regex cuadráticas (corregido) y `datos/` sin ignorar en git (corregido).

**En llano:** la nota ahora entiende ofertas en catalán, pero muchas se apoyan en 1-2 requisitos: es orientativa.

## 11-nov-2026 — Experiencia sin tema: título, negación y paréntesis
Tras `/recomendar ana-datos`, tres 0 injustos: el título traía «con catalán» o el pueblo, «No es necesaria experiencia» se leía como requisito y el paréntesis «(es valorarà…)» hacía de tema. Mar decidió: «no es necesaria» cuenta como 0 años y se añaden «lloc, tasques, similars, funcions» a las palabras de relleno. Cambian solo esas 3 ofertas (58→75, 0→33, 0→25).

**En llano:** el puesto se lee mejor del título, pero la nota sigue siendo orientativa.

## 11-nov-2026 — «Se valora» solo cuando el requisito entero es opcional
Un requisito obligatorio con «(es valorarà X)» pesaba la mitad: el marcador se buscaba en todo el texto. Ahora un paréntesis que empieza por el marcador y añade algo es un extra, y el requisito pesa entero. Fallo mío al implementarlo: el peso se calculaba sobre el texto ya recortado para la explicación; lo cazó la comparación en seco. Con ana: 33→50 y 23→21.

**En llano:** lo opcional de una oferta ya no rebaja lo obligatorio.
