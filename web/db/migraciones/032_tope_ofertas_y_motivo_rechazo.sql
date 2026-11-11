-- B4-10 (revisión del 7-nov):
--  · Tope de ofertas ACTIVAS por empresa (pendientes de revisión + aprobadas): 50. Sin tope, una cuenta de empresa
--    (comprometida o mal usada) podía inundar la cola de moderación y el listado. Lo impone la base (no solo el código) al
--    INSERTAR; un bloqueo por empresa evita que dos publicaciones simultáneas lo rebasen. Cambiar el 50 = nueva migración
--    (CREATE OR REPLACE). Las rechazadas y cerradas no cuentan. Editar una oferta rechazada para que vuelva a revisión no
--    pasa por el tope (diferencia pequeña y conocida).
--  · Motivo de rechazo: texto breve que escribe la administración al rechazar y que la empresa ve en su panel (así sabe qué
--    corregir). Es sobre la OFERTA, nunca sobre candidatas. La web (rol horma_web) puede escribirlo; se borra al aprobar.
-- Reversible:
--   DROP TRIGGER ofertas_tope ON ofertas; DROP FUNCTION ofertas_tope();
--   REVOKE UPDATE (motivo_rechazo) ON ofertas FROM horma_web; ALTER TABLE ofertas DROP COLUMN motivo_rechazo;
ALTER TABLE ofertas ADD COLUMN motivo_rechazo text CHECK (motivo_rechazo IS NULL OR char_length(motivo_rechazo) BETWEEN 1 AND 500);
GRANT UPDATE (motivo_rechazo) ON ofertas TO horma_web;

CREATE FUNCTION ofertas_tope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.empresa_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('ofertas_tope:' || NEW.empresa_id));
    IF (SELECT count(*) FROM ofertas o
         WHERE o.empresa_id = NEW.empresa_id AND o.estado_publicacion IN ('pendiente_de_revision', 'aprobada')) >= 50 THEN
      RAISE EXCEPTION 'tope de 50 ofertas activas por empresa: cierra alguna antes de publicar otra' USING ERRCODE = 'HJ001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ofertas_tope BEFORE INSERT ON ofertas FOR EACH ROW EXECUTE FUNCTION ofertas_tope();
