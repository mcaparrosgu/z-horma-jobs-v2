-- Arreglos de la revisión de la 027 (revisor-seguridad y auditor-lineas-rojas, 9-nov):
--  · La usuaria solo puede aceptar/descartar la versión nueva que VIO: la función exige la huella md5 de version_nueva
--    (mismo espíritu que el sello `version` de aprobar). Si el importador cambió la versión entre medias, no se aplica.
--  · Si la candidatura tiene un envío vivo en el portal de empresas (copia congelada), no se acepta una versión nueva:
--    la empresa seguiría viendo el texto anterior.
-- REGLA (no dar nunca): ningún GRANT sobre candidaturas.version_nueva a horma_web. El hueco del disparador (aprobada ->
-- borrador consumiendo la versión) depende de que solo la función SECURITY DEFINER pueda vaciarla.
-- Reversible: DROP FUNCTION resolver_version_nueva(text, boolean, text); y recrear la de la migración 027.
DROP FUNCTION resolver_version_nueva(text, boolean);

CREATE FUNCTION resolver_version_nueva(p_oferta text, p_aceptar boolean, p_huella text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u text := NULLIF(current_setting('app.usuaria_id', true), '');
  n integer;
BEGIN
  IF u IS NULL OR p_huella IS NULL THEN
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
    WHERE usuaria_id = u AND oferta_id = p_oferta AND estado = 'aprobada' AND version_nueva IS NOT NULL
      AND md5(version_nueva::text) = p_huella
      AND NOT EXISTS (SELECT 1 FROM envios_empresa e WHERE e.usuaria_id = u AND e.oferta_id = p_oferta);
  ELSE
    UPDATE candidaturas SET version_nueva = NULL
    WHERE usuaria_id = u AND oferta_id = p_oferta AND estado = 'aprobada' AND version_nueva IS NOT NULL
      AND md5(version_nueva::text) = p_huella;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION resolver_version_nueva(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_version_nueva(text, boolean, text) TO horma_web;
