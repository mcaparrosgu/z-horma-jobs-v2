-- Bloque 2 de la construcción autónoma (seguimiento): amplía el trigger `candidaturas_transicion` (migración 015)
-- con los estados que registra la propia usuaria tras enviar su candidatura:
--   · enviada       -> entrevista | rechazada | sin_respuesta
--   · entrevista    -> rechazada
--   · borrador | aprobada | pendiente_de_ti -> descartada
-- «aprobada» y «enviada» siguen siendo solo del rol `horma_web` (regla de la migración 015, sin cambios). Los
-- estados nuevos de este bloque también los escribe solo `horma_web` (con la sesión de la usuaria): el importador
-- (rol `horma`) nunca intenta estos estados (su UPDATE solo corre `WHERE estado IN ('borrador','pendiente_de_ti')`,
-- ver SQL_CANDIDATURA), pero así la base lo bloquea también si algún día cambiara ese código.
-- CREATE OR REPLACE sobre la MISMA función: el disparador (TRIGGER) no cambia, solo su cuerpo.
-- Reversible: recrear la función con el cuerpo de la migración 015 (CREATE OR REPLACE FUNCTION candidaturas_transicion()
-- ... solo borrador->aprobada, aprobada->enviada y el vaivén borrador/pendiente_de_ti ...).
CREATE OR REPLACE FUNCTION candidaturas_transicion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado NOT IN ('borrador', 'pendiente_de_ti') THEN
      RAISE EXCEPTION 'una candidatura nueva solo puede ser borrador o pendiente_de_ti';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
      (OLD.estado IN ('borrador', 'pendiente_de_ti') AND NEW.estado IN ('borrador', 'pendiente_de_ti'))
      OR (OLD.estado = 'borrador' AND NEW.estado IN ('aprobada', 'descartada'))
      OR (OLD.estado = 'pendiente_de_ti' AND NEW.estado = 'descartada')
      OR (OLD.estado = 'aprobada' AND NEW.estado IN ('enviada', 'descartada'))
      OR (OLD.estado = 'enviada' AND NEW.estado IN ('entrevista', 'rechazada', 'sin_respuesta'))
      OR (OLD.estado = 'entrevista' AND NEW.estado = 'rechazada')
    ) THEN
      RAISE EXCEPTION 'transición de estado no permitida: % -> %', OLD.estado, NEW.estado;
    END IF;
    -- El vaivén borrador<->pendiente_de_ti lo hace el importador (agente); cualquier otra transición, solo la web.
    IF NOT (OLD.estado IN ('borrador', 'pendiente_de_ti') AND NEW.estado IN ('borrador', 'pendiente_de_ti'))
       AND current_user <> 'horma_web' THEN
      RAISE EXCEPTION 'solo la usuaria, desde la web y con su sesión, cambia el estado de una candidatura';
    END IF;
  END IF;
  RETURN NEW;
END $$;
