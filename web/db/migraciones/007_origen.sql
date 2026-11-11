-- Licencia de origen de una oferta (oferta.json, campo opcional `origen`): con qué permiso la tiene Horma y qué hay que citar.
-- Propuesta por capas. La fija el script de ingesta según la fuente, no un agente.
-- Aditiva y reversible: dos columnas que admiten nulo (las ofertas anteriores quedan «sin licencia indicada»).
ALTER TABLE ofertas
  ADD COLUMN licencia   text CHECK (licencia IN ('empresa', 'socio', 'abierto', 'usuaria')),
  ADD COLUMN atribucion text CHECK (char_length(atribucion) <= 200);
