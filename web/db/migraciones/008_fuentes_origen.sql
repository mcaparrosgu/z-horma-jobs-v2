-- Licencia, atribución y adaptador de cada fuente (los mismos campos que endpoints.json, esquema 0.4).
-- Así el panel puede decir con qué permiso se tienen las ofertas de cada portal y cómo se descargan.
-- Aditiva y reversible: tres columnas que admiten nulo. La clave de API sigue sin guardarse aquí.
ALTER TABLE fuentes
  ADD COLUMN licencia   text CHECK (licencia IN ('empresa', 'socio', 'abierto', 'usuaria')),
  ADD COLUMN atribucion text CHECK (char_length(atribucion) <= 200),
  ADD COLUMN adaptador  text CHECK (adaptador IN ('boe-sumario'));
