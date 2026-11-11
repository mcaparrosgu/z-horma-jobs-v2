-- Rol de la web con el mínimo privilegio (hallazgo 1 del revisor, bloque 8).
-- Hasta ahora la web entraba como `horma`, que es superusuaria: un fallo en la web daba poder total sobre la base.
-- `horma_web` solo lee, y solo escribe lo que la web edita: preferencias, fuentes y eventos.
-- La contraseña NO va aquí (esto se sube a git): `npm run migrar` la pone desde HORMA_WEB_PASSWORD de web/.env.
-- Reversible: REASSIGN OWNED BY horma_web TO horma; DROP OWNED BY horma_web; DROP ROLE horma_web;
-- REGLA para migraciones futuras: toda tabla nueva que la web lea necesita su GRANT SELECT para `horma_web`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'horma_web') THEN
    CREATE ROLE horma_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

GRANT CONNECT ON DATABASE horma TO horma_web;
GRANT USAGE ON SCHEMA public TO horma_web;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO horma_web;
GRANT INSERT, UPDATE ON preferencias, fuentes TO horma_web;
GRANT INSERT ON eventos TO horma_web;
GRANT USAGE ON SEQUENCE eventos_id_seq TO horma_web;
