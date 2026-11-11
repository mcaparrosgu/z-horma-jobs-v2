-- Seguridad por filas (RLS, A3), tablas 3 y 4: matches y candidaturas. ADITIVA (ver 022 para el diseño).
-- `horma` (dueño: importador, exportar, borrar, migraciones) y las funciones SECURITY DEFINER (borrar_cuenta_propia) no
-- están sujetos a RLS. El disparador candidaturas_transicion solo mira OLD/NEW, no otras filas.
-- Rollback:
--   DROP POLICY propia_usuaria ON matches;       ALTER TABLE matches       DISABLE ROW LEVEL SECURITY;
--   DROP POLICY propia_usuaria ON candidaturas;  ALTER TABLE candidaturas  DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY propia_usuaria ON matches TO horma_web
  USING      (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''))
  WITH CHECK (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''));

ALTER TABLE candidaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY propia_usuaria ON candidaturas TO horma_web
  USING      (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''))
  WITH CHECK (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''));
