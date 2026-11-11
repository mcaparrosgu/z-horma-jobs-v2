-- 003_cv_texto.sql · Guarda el texto del cv.md junto al perfil, para poder enseñar el fragmento
-- de donde sale cada dato (el "origen" ya vive dentro de las columnas jsonb). Decisión (k), 5-nov.
-- Solo añade una columna opcional: no toca ni borra nada.
ALTER TABLE perfiles ADD COLUMN cv_texto text CHECK (length(cv_texto) <= 200000);
