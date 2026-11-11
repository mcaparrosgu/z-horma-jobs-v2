-- Seguridad por filas (RLS, A3), tabla 5: envios_empresa. ADITIVA (ver 022 para el diseño).
-- Aquí hay DOS identidades legítimas, cada una con su propia variable de sesión:
--   · la candidata (`app.usuaria_id`): ve, envía (INSERT) y retira (DELETE) los suyos;
--   · la empresa (`app.empresa_id`): ve los envíos que le han hecho a ella y cambia su estado de bandeja (los GRANT de
--     columna ya limitan qué puede actualizar). NO tiene política en perfiles, preferencias, matches ni candidaturas:
--     no ve nada de ellas. Horma nunca ordena ni filtra candidatas para empresas (AI Act, Anexo III.4).
-- Rollback: DROP POLICY propia_usuaria ON envios_empresa;  ALTER TABLE envios_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE envios_empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY propia_usuaria ON envios_empresa TO horma_web
  USING (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), '')
         OR empresa_id = NULLIF(current_setting('app.empresa_id', true), ''))
  WITH CHECK (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), '')
              OR empresa_id = NULLIF(current_setting('app.empresa_id', true), ''));
