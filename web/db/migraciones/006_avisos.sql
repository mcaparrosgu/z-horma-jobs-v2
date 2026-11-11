-- Avisos de una oferta (oferta.json, campo opcional `avisos`): ciudadanía, habilitación de seguridad, residencia o permiso de trabajo.
-- Decisión de Mar, 6-nov. No son competencias: no se puntúan, no se filtran y no los ve ninguna empresa.
-- Aditiva y reversible: una columna con valor por defecto vacío; no toca los datos existentes.
ALTER TABLE ofertas
  ADD COLUMN avisos jsonb NOT NULL DEFAULT '[]';
