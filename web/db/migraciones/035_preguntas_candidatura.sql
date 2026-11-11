-- Preguntas pendientes de la carta en la web (8-nov, esquema candidatura 0.12): lo que el redactor no puede sostener con el
-- CV maestro ni con las respuestas del perfil. Las trae el importador desde preguntas.json; la web solo las LEE.
-- Contestar no escribe aquí: la respuesta va a perfiles.respuestas (migración 034) con el mismo `tema`, y la pregunta
-- se oculta sola mientras exista una respuesta con ese tema. Por eso horma_web no necesita ningún permiso nuevo.
-- Topes en la base: hasta 8 preguntas y 20 KB.
-- Reversible: ALTER TABLE candidaturas DROP COLUMN preguntas_pendientes;
ALTER TABLE candidaturas ADD COLUMN preguntas_pendientes jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT candidaturas_preguntas_forma CHECK (
    jsonb_typeof(preguntas_pendientes) = 'array' AND jsonb_array_length(preguntas_pendientes) <= 8 AND octet_length(preguntas_pendientes::text) <= 20000);
