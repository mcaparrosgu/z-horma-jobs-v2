-- Endurece borrar_cuenta_propia (revisión de seguridad, hallazgo medio): una función SECURITY DEFINER con
-- search_path = public sin pg_temp al final deja que se «sombreen» tablas con tablas temporales de la sesión.
-- Con pg_temp el último, solo se resuelven las tablas reales. Reversible: ALTER FUNCTION ... SET search_path = public;
ALTER FUNCTION borrar_cuenta_propia(text) SET search_path = public, pg_temp;
