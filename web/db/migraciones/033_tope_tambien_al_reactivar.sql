-- Arreglo de la revisión de cierre del paso 5 (revisor-seguridad, 9-nov): el tope de 50 ofertas activas (032) solo se
-- comprobaba al INSERTAR. Una empresa podía rebasarlo editando ofertas rechazadas, que vuelven a «pendiente_de_revision»
-- (SQL_EDITAR_OFERTA). Ahora el tope también se comprueba en el UPDATE de estado_publicacion cuando una oferta pasa de NO
-- activa (rechazada/cerrada) a activa (pendiente/aprobada). Pasar de pendiente a aprobada (moderación) no cambia el recuento.
-- Reversible: DROP TRIGGER ofertas_tope ON ofertas; CREATE TRIGGER ofertas_tope BEFORE INSERT ON ofertas FOR EACH ROW EXECUTE FUNCTION ofertas_tope();
--             y recrear la función con el cuerpo de la 032.
CREATE OR REPLACE FUNCTION ofertas_tope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  era_activa boolean;
  es_activa  boolean := NEW.estado_publicacion IN ('pendiente_de_revision', 'aprobada');
BEGIN
  IF NEW.empresa_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    era_activa := OLD.estado_publicacion IN ('pendiente_de_revision', 'aprobada');
    IF era_activa OR NOT es_activa THEN
      RETURN NEW; -- no suma ninguna oferta activa nueva
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ofertas_tope:' || NEW.empresa_id));
  IF (SELECT count(*) FROM ofertas o
       WHERE o.empresa_id = NEW.empresa_id AND o.estado_publicacion IN ('pendiente_de_revision', 'aprobada')) >= 50 THEN
    RAISE EXCEPTION 'tope de 50 ofertas activas por empresa: cierra alguna antes de publicar otra' USING ERRCODE = 'HJ001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER ofertas_tope ON ofertas;
CREATE TRIGGER ofertas_tope BEFORE INSERT OR UPDATE OF estado_publicacion ON ofertas FOR EACH ROW EXECUTE FUNCTION ofertas_tope();
