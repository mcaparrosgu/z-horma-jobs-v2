-- Feina Activa (9-nov): el adaptador `feinaactiva-xml` ya existe en ingestar.py y en el esquema endpoints.json (enum), pero la
-- tabla `fuentes` solo admitía 'boe-sumario' (migración 008) y el importador fallaba con fuentes_adaptador_check.
-- Solo cambia la lista de valores permitidos; no toca datos ni permisos.
-- Reversible (si ninguna fuente usa el valor nuevo):
--   ALTER TABLE fuentes DROP CONSTRAINT fuentes_adaptador_check,
--     ADD CONSTRAINT fuentes_adaptador_check CHECK (adaptador IN ('boe-sumario'));
ALTER TABLE fuentes
  DROP CONSTRAINT fuentes_adaptador_check,
  ADD CONSTRAINT fuentes_adaptador_check CHECK (adaptador IN ('boe-sumario', 'feinaactiva-xml'));
