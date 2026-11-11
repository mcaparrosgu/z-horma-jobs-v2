-- Entrevista única (9-nov, esquema perfil 0.11): lo que la usuaria contesta una vez (motivaciones, qué valora,
-- herramientas, logros) vive en el perfil como lista de {tema, texto, fecha}. La web le deja verlas, añadirlas y borrarlas.
-- Sin tabla nueva: perfiles ya tiene RLS (propia_usuaria), se exporta con to_jsonb(p) y se borra en cascada con la cuenta.
-- Permisos mínimos: la web (horma_web) solo puede actualizar ESTA columna de perfiles, nunca el resto del perfil.
-- Topes en la base: lista de hasta 60 respuestas y 100 KB en total.
-- Reversible: REVOKE UPDATE (respuestas) ON perfiles FROM horma_web; ALTER TABLE perfiles DROP COLUMN respuestas;
ALTER TABLE perfiles ADD COLUMN respuestas jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT perfiles_respuestas_forma CHECK (
    jsonb_typeof(respuestas) = 'array' AND jsonb_array_length(respuestas) <= 60 AND octet_length(respuestas::text) <= 100000);
GRANT UPDATE (respuestas) ON perfiles TO horma_web;
