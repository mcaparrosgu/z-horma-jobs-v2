# Cambios de esquema

Un cambio de esquema es un cambio de contrato entre agentes y web. Se anota aquí antes de tocarlo.

## 0.13 · 2026-11-10

- **Nuevo esquema `cv-base.json`** (pedido de Mar, 10-nov): la salida de `generador-cv-base`, que hasta ahora solo estaba descrita en el prompt del agente. Forma: `{cv_base: [{sector, cv_md, traza[], cambios_propuestos[]}]}`, de 1 a 4 CV; `traza` con la misma forma que `candidatura.traza` (`{frase, origen}`). Decisión: esquema propio y no JSON Resume, porque cada frase debe llevar su `origen` (línea roja) y `verificar.py`, el hook, los evals y el importador de la web leen `cv.md` + `traza.json`; sustituirlos sería un cambio grande. JSON Resume queda como posible exportación futura. **Compatible hacia atrás:** no cambia ningún archivo en disco; los CV base ya generados cumplen. `/perfilar` valida la salida del agente contra él antes de escribir `cv.md` y `traza.json` (en disco, `traza.json` es solo la lista `traza`). Sin migración de base de datos. **`origen.archivo` de la traza** solo admite `cv-maestro.md` (revisión de seguridad y de líneas rojas, 10-nov): `generador-cv-base` no recibe las respuestas de la entrevista, así que un origen `respuesta-usuaria` en un CV base no tiene sentido hoy; el verificador sí lo admite para las candidaturas, que no cambian. **Validador (mismo día):** `validar.py` ahora aplica `minLength` y `maxLength` (antes los ignoraba, aunque los esquemas los declaran; la web con Ajv sí los aplicaba). Comprobado: 51 evals y las 43 ofertas reales siguen validando. Nota: la descripción de `candidatura.preguntas_pendientes` cita una «0.12» que no consta aquí; conviene anotarla.

## 0.12 · 2026-11-08

- `candidatura.preguntas_pendientes` (opcional, anotada ahora con retraso): lista de `{tema, pregunta, esencial}`, máximo 8, con lo que la carta necesita saber y ni el CV maestro ni las respuestas del perfil recogen. Archivo opcional `preguntas.json` por candidatura que importa el importador (descarta repetidas y las que parecen una orden a una IA); migración `035` (solo lectura para la web, sin GRANT nuevo). La usuaria las contesta en la web y la respuesta se guarda en `perfil.respuestas` con el mismo `tema`. Compatible hacia atrás: sin el campo todo valida igual. Detalle: bitácora del 8-nov.

## 0.11 · 2026-11-09

- `perfil.respuestas` (opcional): lista de `{tema, texto, fecha}` (`fecha` `AAAA-MM-DD`, `texto` hasta 1500 caracteres). Es la «entrevista única» (pedido de Mar, 8-nov; decisión 9-nov: las respuestas viven en el perfil): lo que la usuaria contesta una vez no se vuelve a preguntar en cada candidatura. `origen.archivo` ya era texto libre: el valor `respuesta-usuaria` pasa a significar «el fragmento es un trozo literal de una respuesta guardada» y lo comprueba `verificar.py` (también aceptan sus cifras y fechas). Compatible hacia atrás: sin el campo todo valida igual. **Pista B (9-nov, migración 034):** `perfiles.respuestas` (jsonb, tope de 60 y 100 KB); el importador las inserta al crear el perfil y nunca las pisa después (manda la web) y la web deja verlas, añadirlas y borrarlas. La sincronización con `perfil.json` en disco es manual: `npm run respuestas -- --usuaria <id> --bajar|--subir` (la ejecuta `/candidatura`).

## 0.10 · 2026-11-09

- `candidatura.ats.no_medidos` (opcional): lista de textos con los requisitos de la oferta que `medir_ats.py` no sabe medir (años de experiencia, idiomas, etc.). Hasta ahora el importador los descartaba y la web mostraba «no verificados» sin explicarlo. Hallazgo de la pasada completa (8-nov), aprobado por Mar el 9-nov. Compatible hacia atrás: sin el campo todo valida igual y la web no muestra nada extra. Sin migración (`ats` ya es JSON). Quien lo lea debe tratar su ausencia como lista vacía. `presentes` sigue siendo clave de trabajo y no se guarda.

## 0.9 · 2026-11-07

- `oferta.fecha_cierre` (opcional): `AAAA-MM-DD` o `null`. Es el plazo de cierre cuando la fuente lo da (p. ej. convocatorias). Pedido por el bloque A1 (calidad de ofertas, profesor 5-nov: «ingesta como antes»: fuentes, filtros, deduplicación): una oferta con `fecha_cierre` anterior a hoy se oculta en `/ofertas` y no se recomienda (`buscar.py` la descarta). **Solo aditivo:** los archivos sin el campo siguen validando y ningún extractor tiene que rellenarlo. **Afecta a la pista A:** `buscar.py` ya lo lee (nuevo `--hoy` solo para pruebas) y el eval `fecha_cierre` lo cubre. En la base de datos, migración `021` (columna `fecha_cierre date`, junto a `url_canonica`, `huella`, `grupo_dedup`, `primera_vista`, `ultima_vista` y `veces_vista`, que no son del esquema porque las calcula el importador).

## 0.8 · 2026-11-06

- `oferta.descripcion` (opcional): texto plano de hasta 8000 caracteres. Lo pide el bloque 3 de la construcción autónoma (portal de empresas): el formulario `/empresa/ofertas/nueva` de la web lo rellena; las ofertas que traen los agentes (scraping) no lo traen y siguen validando igual. Afecta solo a la pista B (web); no toca ningún extractor de la pista A. En la base de datos, migración `018` (columna `descripcion`, nullable).

## 0.7 · 2026-11-06

- `match.ofertas[].nota` admite `null` («sin datos suficientes»): decisión tras el aviso de `auditor-lineas-rojas` sobre las ofertas del BOE sin requisitos, donde un 15 parecía una medición y no lo era. Es un valor nuevo: quien lea `nota` debe tratar `null` (la web la rotula «sin nota» y la ordena al final; migración `012`). **Estrecha** además lo que valida: `fecha` con formato `AAAA-MM-DD`, `version_perfil` de 1 a 80 caracteres, `explicacion` de 1 a 1500 y `correccion` de hasta 1500 (los mismos límites que la tabla `matches`).

## 0.6 · 2026-11-06

- `perfil.taxonomia.niveles_por_familia` (opcional): lista de `{familia, nivel, origen}`. Decisión de Mar (6-nov): el nivel depende de la experiencia en cada área (senior en atención al cliente, junior en IA). `taxonomia.nivel` se mantiene como nivel general y como valor de reserva. Compatible hacia atrás: los perfiles sin el campo siguen validando y se comportan como antes (`taxonomia` es `jsonb` en la base: no hace falta migración). Lo usan `buscar.py` (los 2 puntos de nivel se miran con el nivel de la familia de la oferta), `clasificador-candidato` (lo rellena solo con origen) y la ficha de la web. El matcher no lo ve ni lo usa para la nota. Es de uso interno de Horma (ordena ofertas para ella): nunca se muestra a empresas.

## 0.5 · 2026-11-06

- `perfil.usuaria_id` y `match.usuaria_id`: el patrón pasa a **solo minúsculas** (`^[a-z0-9_-][a-z0-9_.-]{0,79}$`). Motivo: en Windows `Ana` y `ana` son la misma carpeta, pero en la base eran dos usuarias distintas (hallazgo del `revisor-seguridad` sobre exportar y borrar); la migración `010` ya lo impide en la base y la web ya solo acepta minúsculas. **Estrecha** lo que valida: un archivo con `usuaria_id` en mayúsculas deja de ser válido (no había ninguno). Los comandos que reciben una usuaria piden también minúsculas; el patrón de ofertas y fuentes no cambia (los ids de oferta llevan mayúsculas, p. ej. del BOE).

## 0.4 · 2026-11-06

- `oferta.origen` (opcional): `{licencia, atribucion}` con `licencia` en `empresa`, `socio`, `abierto`, `usuaria` y `atribucion` texto o null. Es el «campo de licencia de origen» pedido en la propuesta por capas: con qué permiso tiene Horma la oferta y qué hay que citar al mostrarla. **Lo estampa el script, no un agente:** la licencia es propiedad de la fuente (`endpoints.json`), `ingestar.py` la escribe en la cabecera del `raw/` y el extractor la copia sin deducirla. Opcional, así los archivos anteriores siguen validando; en la base de datos, migración `007`.
- `endpoints.fuentes[].licencia` y `.atribucion` (opcionales en el esquema, para que el formulario `/fuentes` de la web siga validando): `ingestar.py` **se niega** a ingestar una fuente sin `licencia` válida.

## 0.3 · 2026-11-06

- `oferta.avisos` (opcional): lista de `{tipo, texto}` con `tipo` en `ciudadania`, `habilitacion_seguridad`, `residencia_o_permiso`, `otro`. Decisión de Mar (6-nov), por el aviso de `auditor-lineas-rojas`: la ciudadanía o la habilitación de seguridad que piden algunas ofertas (Saab, Ida Infront, Epical) iban como una frase más en `requisitos`, y si algún día se puntúa con `requisitos` se puntuaría por nacionalidad. Se muestran a la usuaria y **nunca** entran en la nota, el filtro ni lo que ve una empresa. Opcional, así los archivos anteriores siguen validando; en la base de datos, migración `006`.

## 0.2 · 2026-11-05

- `preferencias.horario` (opcional): lista de `manana`, `tarde`, `noche`, `flexible`. Decisión de Mar (5-nov): la usuaria dice «solo mañanas» y el matcher lo compara con el horario de la oferta solo si la oferta lo dice. No se deduce del CV. Opcional para que los archivos anteriores sigan validando; en la base de datos, migración `005`.

## 0.1 · 2026-11-03

- Versión inicial a partir del documento del profesor «Horma: flujo agéntico en Claude Code».
- Añadidos sobre el documento (todos opcionales, para que el filtro duro funcione): `preferencias.ciudades`, `preferencias.sectores`, `preferencias.niveles`, `oferta.pais`, `oferta.salario.periodo` y `candidatura.huecos[].relleno_aviso` (aviso de dónde se rellenó cada hueco; comentario del profesor del 3-nov).
- `perfil.instrucciones_embebidas` (opcional): un CV puede traer órdenes a un agente, igual que una oferta (prueba con CV de prueba, 3-nov).
- `oferta.idioma`: formato canónico (nombre en español, minúsculas) documentado; el stack de la taxonomía ya no admite idiomas (prueba con ofertas de prueba, 3-nov).
- Nuevo `clasificacion-respuesta.json` (8.º esquema): salida de `clasificador-respuesta`, con `avisos` (phishing, fecha ambigua). Faltaba en el documento del profesor; lo detectó el propio agente en la prueba (3-nov).
- `endpoints.json`: añadidos `clave_en` y `clave_nombre` (dónde pone la clave el script) y `mapeo_campos.lista` (dónde está el array en la respuesta). El archivo de datos está en `.claude/skills/fuentes-ofertas/endpoints.json`; este es su esquema.
