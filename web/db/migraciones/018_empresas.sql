-- Bloque 3 de la construcción autónoma (portal de empresas I): identidad aparte para empresas, publicar oferta
-- y moderación. Aditiva: tablas nuevas y columnas nuevas en `ofertas` (nada existente cambia de valor).
-- Reversible: DROP TRIGGER ofertas_moderacion ON ofertas; DROP FUNCTION ofertas_moderacion();
--             ALTER TABLE ofertas DROP COLUMN descripcion, DROP COLUMN estado_publicacion, DROP COLUMN empresa_id;
--             DROP TABLE sesiones_empresa, cuentas_empresa, empresas;

-- 1) Identidad de empresa, aparte de usuarias: tablas propias, sesión propia (otra cookie). Una sesión de empresa
--    nunca vale para páginas de candidata ni al revés (no comparten ninguna tabla de sesión ni de cuenta).
CREATE TABLE empresas (
  id        text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  nombre    text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 200),
  creada_en timestamptz NOT NULL DEFAULT now()
);

-- Alta solo por terminal (`npm run cuenta-empresa`, modo piloto): sin verificación de correo no se abre el
-- registro público. La web nunca puede crear una fila aquí (sin GRANT INSERT para horma_web).
CREATE TABLE cuentas_empresa (
  empresa_id      text PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  email           text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254 AND email !~ '\s'),
  hash            text NOT NULL CHECK (hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'),
  fallos          integer NOT NULL DEFAULT 0 CHECK (fallos >= 0),
  bloqueada_hasta timestamptz,
  creada_en       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sesiones_empresa (
  huella     text PRIMARY KEY CHECK (huella ~ '^[0-9a-f]{64}$'),
  empresa_id text NOT NULL REFERENCES cuentas_empresa(empresa_id) ON DELETE CASCADE,
  creada_en  timestamptz NOT NULL DEFAULT now(),
  caduca_en  timestamptz NOT NULL
);
CREATE INDEX sesiones_empresa_idx ON sesiones_empresa (empresa_id);

GRANT SELECT ON empresas, cuentas_empresa, sesiones_empresa TO horma_web;
GRANT INSERT, DELETE ON sesiones_empresa TO horma_web;
GRANT UPDATE (fallos, bloqueada_hasta) ON cuentas_empresa TO horma_web;

-- 2) Moderación de ofertas. `descripcion` es nueva (las ofertas traídas por agentes no la traen: columna
--    opcional). `estado_publicacion` por defecto 'aprobada' para TODO lo que ya existe (no cambia nada visible);
--    una oferta de empresa nace 'pendiente_de_revision' y no aparece en /ofertas hasta que administración la
--    aprueba (lo hace cumplir el disparador de abajo, no solo el código).
ALTER TABLE ofertas
  ADD COLUMN descripcion        text CHECK (descripcion IS NULL OR char_length(descripcion) <= 8000),
  ADD COLUMN estado_publicacion text NOT NULL DEFAULT 'aprobada'
             CHECK (estado_publicacion IN ('aprobada', 'pendiente_de_revision', 'rechazada', 'cerrada')),
  ADD COLUMN empresa_id         text REFERENCES empresas(id) ON DELETE CASCADE;
CREATE INDEX ofertas_empresa_idx ON ofertas (empresa_id);

CREATE FUNCTION ofertas_moderacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Defensa en la base: aunque el código de la web tuviera un fallo, una oferta de empresa nunca nace aprobada.
    IF NEW.empresa_id IS NOT NULL AND NEW.estado_publicacion <> 'pendiente_de_revision' THEN
      RAISE EXCEPTION 'una oferta de empresa nace pendiente_de_revision';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado_publicacion IS DISTINCT FROM OLD.estado_publicacion THEN
    IF NOT (
      (OLD.estado_publicacion = 'pendiente_de_revision' AND NEW.estado_publicacion IN ('aprobada', 'rechazada'))
      OR (OLD.estado_publicacion = 'aprobada' AND NEW.estado_publicacion IN ('cerrada', 'pendiente_de_revision'))
      OR (OLD.estado_publicacion = 'rechazada' AND NEW.estado_publicacion = 'pendiente_de_revision')
    ) THEN
      RAISE EXCEPTION 'transición de publicación no permitida: % -> %', OLD.estado_publicacion, NEW.estado_publicacion;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ofertas_moderacion
  BEFORE INSERT OR UPDATE ON ofertas
  FOR EACH ROW EXECUTE FUNCTION ofertas_moderacion();

-- 3) Permisos mínimos para que la empresa publique/edite y administración apruebe, todo con el rol `horma_web`
--    (la diferencia entre empresa y administración la hace el código, con la sesión de cada una: igual que ya
--    distingue usuaria de administración sobre otras tablas). Nunca sector/familia/auditoria (los pone solo el
--    importador) ni corrida_id/ejecucion_id (son del pipeline de ingesta).
GRANT INSERT (id, fuente, url, fecha, titulo, empresa, ubicacion, pais, remoto, contrato, idioma, nivel,
              requisitos, salario, stack, avisos, auditoria, licencia, atribucion, descripcion,
              estado_publicacion, empresa_id) ON ofertas TO horma_web;
GRANT UPDATE (titulo, descripcion, ubicacion, pais, remoto, contrato, idioma, nivel, requisitos, salario,
              stack, avisos, estado_publicacion) ON ofertas TO horma_web;
