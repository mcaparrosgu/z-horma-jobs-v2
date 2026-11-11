-- Seguridad por filas (RLS, A3), tablas 1 y 2: perfiles y preferencias. ADITIVA: solo activa RLS y crea políticas.
-- Defensa en profundidad: aunque una consulta de la web se equivoque de usuaria_id, la base no entrega filas ajenas.
-- La web fija la usuaria con `conUsuaria()` (SELECT set_config('app.usuaria_id', …, true) dentro de una transacción).
-- SIN esa variable la política no coincide con nada: falla cerrado. El dueño `horma` (migraciones, importador, exportar,
-- borrar, terminal) NO está sujeto a RLS (no se usa FORCE), y las funciones SECURITY DEFINER, tampoco.
-- Rollback:
--   DROP POLICY propia_usuaria ON perfiles;      ALTER TABLE perfiles      DISABLE ROW LEVEL SECURITY;
--   DROP POLICY propia_usuaria ON preferencias;  ALTER TABLE preferencias  DISABLE ROW LEVEL SECURITY;
--   REVOKE ALL ON FUNCTION usuarias_con_perfil() FROM horma_web;  DROP FUNCTION usuarias_con_perfil();
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY propia_usuaria ON perfiles TO horma_web
  USING      (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''))
  WITH CHECK (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''));

ALTER TABLE preferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY propia_usuaria ON preferencias TO horma_web
  USING      (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''))
  WITH CHECK (usuaria_id = NULLIF(current_setting('app.usuaria_id', true), ''));

-- La lista de administración (/candidatos) enseñaba «con perfil / sin perfil» de cada cuenta con un LEFT JOIN a perfiles.
-- Con RLS el administrador ya no ve filas ajenas, así que ese único dato (¿tiene perfil?, sin contenido ni ids visibles)
-- sale de esta función SECURITY DEFINER: devuelve solo ids con perfil, nada más.
CREATE FUNCTION usuarias_con_perfil() RETURNS TABLE (usuaria_id text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT p.usuaria_id FROM perfiles p $$;
REVOKE ALL ON FUNCTION usuarias_con_perfil() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION usuarias_con_perfil() TO horma_web;
