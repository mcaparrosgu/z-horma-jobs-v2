-- Defensa en la base de datos de la línea roja «ningún agente aprueba» (hallazgo 4 del revisor de seguridad, bloque 4).
-- Hasta ahora la regla estaba solo en el texto de las consultas y en el importador. Ahora la hace cumplir la base:
--   · una candidatura nueva solo puede nacer como borrador o pendiente_de_ti (nunca aprobada ni enviada);
--   · «aprobada» y «enviada» solo las puede escribir el rol de la web (`horma_web`, con la sesión de la usuaria), nunca el
--     importador ni la terminal (`horma`);
--   · el estado solo avanza en orden: borrador → aprobada → enviada (los demás estados llegan en el bloque de seguimiento).
-- Reversible: DROP TRIGGER candidaturas_transicion ON candidaturas; DROP FUNCTION candidaturas_transicion();
CREATE FUNCTION candidaturas_transicion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado NOT IN ('borrador', 'pendiente_de_ti') THEN
      RAISE EXCEPTION 'una candidatura nueva solo puede ser borrador o pendiente_de_ti';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
      (OLD.estado = 'borrador' AND NEW.estado = 'aprobada')
      OR (OLD.estado = 'aprobada' AND NEW.estado = 'enviada')
      OR (OLD.estado IN ('borrador', 'pendiente_de_ti') AND NEW.estado IN ('borrador', 'pendiente_de_ti'))
    ) THEN
      RAISE EXCEPTION 'transición de estado no permitida: % -> %', OLD.estado, NEW.estado;
    END IF;
    IF NEW.estado IN ('aprobada', 'enviada') AND current_user <> 'horma_web' THEN
      RAISE EXCEPTION 'solo la usuaria, desde la web y con su sesión, aprueba o anota el envío';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER candidaturas_transicion
  BEFORE INSERT OR UPDATE ON candidaturas
  FOR EACH ROW EXECUTE FUNCTION candidaturas_transicion();
