-- Bloque 1 de la construcción autónoma (RGPD, derecho de supresión desde la web).
-- No se da GRANT DELETE directo a horma_web sobre «usuarias» (si algo fallara en el código de la web, podría borrar
-- cualquier fila). En su lugar, una función que solo borra el id que recibe y NUNCA una cuenta de administración
-- (defensa también en la base: la regla «la cuenta de administración no se borra desde la web» no depende solo del
-- código de la página). El id que se le pasa sale siempre de la sesión (requerirSesion), nunca del formulario.
-- Reversible: REVOKE EXECUTE ON FUNCTION borrar_cuenta_propia(text) FROM horma_web; DROP FUNCTION borrar_cuenta_propia(text);
CREATE FUNCTION borrar_cuenta_propia(p_id text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM cuentas WHERE usuaria_id = p_id AND rol = 'admin') THEN
    RETURN 0;
  END IF;
  DELETE FROM usuarias WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION borrar_cuenta_propia(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION borrar_cuenta_propia(text) TO horma_web;
