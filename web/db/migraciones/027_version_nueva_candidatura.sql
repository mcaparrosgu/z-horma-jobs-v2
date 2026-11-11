-- Paso 5 de la pasada completa (hallazgo: carta mejorada después de aprobar). Antes, reimportar una candidatura ya
-- aprobada no hacía nada y la usuaria no se enteraba de que había un texto nuevo. Ahora el importador deja la versión
-- nueva APARTE (`version_nueva`) sin tocar el texto aprobado, y solo la usuaria, con su sesión, decide:
--   · aceptarla -> la candidatura vuelve a «borrador» con el texto nuevo y hay que aprobarla otra vez;
--   · descartarla -> sigue la aprobada.
-- El texto aprobado (y el que se envía) nunca cambia sin su aprobación. Una candidatura «enviada» no admite versión nueva.
--
-- Seguridad: horma_web NO recibe UPDATE sobre cv_md/carta_md/traza…; lo hace una función SECURITY DEFINER que solo actúa
-- sobre la usuaria de la SESIÓN (app.usuaria_id), nunca sobre un id que llegue por parámetro (mismo patrón que
-- borrar_cuenta_propia, 016/020). El disparador deja de exigir `horma_web` solo para ese paso concreto
-- (aprobada -> borrador con versión pendiente que se consume, y solo para la usuaria de la sesión); el resto no cambia.
-- Reversible:
--   REVOKE EXECUTE ON FUNCTION resolver_version_nueva(text, boolean) FROM horma_web;
--   DROP FUNCTION resolver_version_nueva(text, boolean);
--   ALTER TABLE candidaturas DROP COLUMN version_nueva;
--   y recrear candidaturas_transicion() con el cuerpo de la migración 017.
ALTER TABLE candidaturas ADD COLUMN version_nueva jsonb;

CREATE OR REPLACE FUNCTION candidaturas_transicion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  acepta_version boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado NOT IN ('borrador', 'pendiente_de_ti') THEN
      RAISE EXCEPTION 'una candidatura nueva solo puede ser borrador o pendiente_de_ti';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    -- Aceptar una versión nueva: aprobada -> borrador, consumiendo la versión pendiente, y solo la dueña de la fila.
    acepta_version := OLD.estado = 'aprobada' AND NEW.estado = 'borrador'
      AND OLD.version_nueva IS NOT NULL AND NEW.version_nueva IS NULL
      AND NEW.usuaria_id = NULLIF(current_setting('app.usuaria_id', true), '');
    IF NOT (
      (OLD.estado IN ('borrador', 'pendiente_de_ti') AND NEW.estado IN ('borrador', 'pendiente_de_ti'))
      OR (OLD.estado = 'borrador' AND NEW.estado IN ('aprobada', 'descartada'))
      OR (OLD.estado = 'pendiente_de_ti' AND NEW.estado = 'descartada')
      OR (OLD.estado = 'aprobada' AND NEW.estado IN ('enviada', 'descartada'))
      OR (OLD.estado = 'enviada' AND NEW.estado IN ('entrevista', 'rechazada', 'sin_respuesta'))
      OR (OLD.estado = 'entrevista' AND NEW.estado = 'rechazada')
      OR acepta_version
    ) THEN
      RAISE EXCEPTION 'transición de estado no permitida: % -> %', OLD.estado, NEW.estado;
    END IF;
    -- El vaivén borrador<->pendiente_de_ti lo hace el importador (agente); cualquier otra transición, solo la web.
    IF NOT (OLD.estado IN ('borrador', 'pendiente_de_ti') AND NEW.estado IN ('borrador', 'pendiente_de_ti'))
       AND current_user <> 'horma_web' AND NOT acepta_version THEN
      RAISE EXCEPTION 'solo la usuaria, desde la web y con su sesión, cambia el estado de una candidatura';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- p_aceptar = true: la versión nueva pasa a ser el borrador. false: se descarta. Devuelve filas cambiadas (0 o 1).
CREATE FUNCTION resolver_version_nueva(p_oferta text, p_aceptar boolean) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u text := NULLIF(current_setting('app.usuaria_id', true), '');
  n integer;
BEGIN
  IF u IS NULL THEN
    RETURN 0;
  END IF;
  IF p_aceptar THEN
    UPDATE candidaturas SET
      cv_usado = version_nueva->>'cv_usado',
      cv_md = version_nueva->>'cv_md',
      carta_md = version_nueva->>'carta_md',
      traza = version_nueva->'traza',
      traza_carta = NULLIF(version_nueva->'traza_carta', 'null'::jsonb),
      huecos = version_nueva->'huecos',
      ats = version_nueva->'ats',
      estado = 'borrador',
      historial = historial || jsonb_build_array(jsonb_build_object(
        'estado', 'borrador', 'fecha', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 'por', 'usuaria',
        'motivo', 'aceptó una versión nueva del texto; hay que aprobarla de nuevo')),
      version_nueva = NULL,
      actualizado_en = now()
    WHERE usuaria_id = u AND oferta_id = p_oferta AND estado = 'aprobada' AND version_nueva IS NOT NULL;
  ELSE
    UPDATE candidaturas SET version_nueva = NULL
    WHERE usuaria_id = u AND oferta_id = p_oferta AND estado = 'aprobada' AND version_nueva IS NOT NULL;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION resolver_version_nueva(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_version_nueva(text, boolean) TO horma_web;
