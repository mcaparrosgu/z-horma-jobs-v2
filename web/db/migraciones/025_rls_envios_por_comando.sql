-- Endurece la RLS de envios_empresa (A4, revisión de seguridad): una política por comando en vez de una para todo.
--   · SELECT: la candidata (los suyos) o la empresa (los que le han enviado).
--   · INSERT y DELETE: solo la candidata (enviar y retirar son cosas suyas).
--   · UPDATE: solo la empresa (el estado de la bandeja es suyo; los GRANT de columna ya limitan a estado_bandeja).
-- ADITIVA. Rollback: DROP POLICY envio_select, envio_insert, envio_delete, envio_update ON envios_empresa;
--   y volver a crear la política única de 024.
DROP POLICY IF EXISTS propia_usuaria ON envios_empresa;
CREATE POLICY envio_select ON envios_empresa FOR SELECT TO horma_web
  USING (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), '')
         OR empresa_id = NULLIF(current_setting('app.empresa_id', true), ''));
CREATE POLICY envio_insert ON envios_empresa FOR INSERT TO horma_web
  WITH CHECK (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''));
CREATE POLICY envio_delete ON envios_empresa FOR DELETE TO horma_web
  USING (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''));
CREATE POLICY envio_update ON envios_empresa FOR UPDATE TO horma_web
  USING (empresa_id = NULLIF(current_setting('app.empresa_id', true), ''))
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), ''));
