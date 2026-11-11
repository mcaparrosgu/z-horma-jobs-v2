-- B4-5 y B4-6 (revisión del 7-nov): defensa en la base para el envío a empresas. Hasta ahora «el envío es a la empresa
-- DUEÑA de esa oferta, y la oferta está aprobada» lo cumplía solo el código (SQL_CANDIDATURA_PARA_ENVIAR). Ahora también
-- la base, por si algún día falla el código:
--  · B4-6: clave foránea COMPUESTA (oferta_id, empresa_id) -> ofertas(id, empresa_id): el envío no puede apuntar a una
--    empresa que no sea la dueña de la oferta, ni a una oferta sin empresa (NULL no casa con la clave).
--  · B4-5: disparador al INSERTAR: la oferta tiene que estar «aprobada» y la candidatura de esa usuaria debe existir y estar
--    «aprobada» o «enviada» (el reenvío tras retirar parte de «enviada»).
-- Los datos actuales cumplen las dos reglas (comprobado: 0 envíos incoherentes). No cambia ningún permiso.
-- Reversible:
--   DROP TRIGGER envios_empresa_comprobar ON envios_empresa; DROP FUNCTION envios_empresa_comprobar();
--   ALTER TABLE envios_empresa DROP CONSTRAINT envios_oferta_empresa_fk;
--   ALTER TABLE ofertas DROP CONSTRAINT ofertas_id_empresa_uq;
ALTER TABLE ofertas ADD CONSTRAINT ofertas_id_empresa_uq UNIQUE (id, empresa_id);
ALTER TABLE envios_empresa ADD CONSTRAINT envios_oferta_empresa_fk
  FOREIGN KEY (oferta_id, empresa_id) REFERENCES ofertas (id, empresa_id) ON DELETE CASCADE;

CREATE FUNCTION envios_empresa_comprobar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ofertas o WHERE o.id = NEW.oferta_id AND o.empresa_id = NEW.empresa_id AND o.estado_publicacion = 'aprobada') THEN
    RAISE EXCEPTION 'solo se envía a una oferta aprobada de esa empresa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM candidaturas c WHERE c.usuaria_id = NEW.usuaria_id AND c.oferta_id = NEW.oferta_id AND c.estado IN ('aprobada', 'enviada')) THEN
    RAISE EXCEPTION 'solo se envía una candidatura aprobada por la usuaria';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER envios_empresa_comprobar BEFORE INSERT ON envios_empresa
  FOR EACH ROW EXECUTE FUNCTION envios_empresa_comprobar();
