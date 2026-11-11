-- Horario preferido de la usuaria (preferencias.json, campo opcional `horario`). Decisión de Mar, 5-nov.
-- Aditiva y reversible: una columna con valor por defecto vacío; no toca los datos existentes.
ALTER TABLE preferencias
  ADD COLUMN horario text[] NOT NULL DEFAULT '{}'
  CHECK (horario <@ ARRAY['manana', 'tarde', 'noche', 'flexible']);
