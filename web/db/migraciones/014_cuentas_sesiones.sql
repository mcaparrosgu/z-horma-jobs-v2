-- Bloque 4 de la construcción optimizada: ids opacos, cuentas y sesiones.
-- Aditiva y reversible: DROP TABLE sesiones, cuentas; ALTER TABLE usuarias DROP COLUMN publico;
-- (no cambia ni borra ningún dato existente: solo añade).

-- 1) Id público opaco. Es el que va en las URLs; el id legible (`mar`) queda para uso interno y comandos.
--    UUID v4 = 122 bits aleatorios: no se puede adivinar ni enumerar (`/candidaturas/mar` sí se adivinaba).
ALTER TABLE usuarias ADD COLUMN publico uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;

-- 2) Cuentas: cómo entra cada usuaria. Un correo (único, en minúsculas), una contraseña con hash (o ninguna,
--    si solo entra con Google) y, opcionalmente, su identificador de Google.
CREATE TABLE cuentas (
  usuaria_id       text PRIMARY KEY REFERENCES usuarias(id) ON DELETE CASCADE,
  email            text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254 AND email !~ '\s'),
  hash             text CHECK (hash IS NULL OR hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'),
  google_sub       text UNIQUE CHECK (google_sub IS NULL OR char_length(google_sub) BETWEEN 1 AND 255),
  email_verificado boolean NOT NULL DEFAULT false,
  rol              text NOT NULL DEFAULT 'usuaria' CHECK (rol IN ('usuaria','admin')),
  fallos           integer NOT NULL DEFAULT 0 CHECK (fallos >= 0),
  bloqueada_hasta  timestamptz,
  creada_en        timestamptz NOT NULL DEFAULT now(),
  CHECK (hash IS NOT NULL OR google_sub IS NOT NULL)
);

-- 3) Sesiones: en la cookie va un secreto aleatorio; aquí solo su huella SHA-256 (si se filtrara la base,
--    las huellas no sirven para entrar). Caducan solas y se borran con su cuenta (RGPD).
CREATE TABLE sesiones (
  huella      text PRIMARY KEY CHECK (huella ~ '^[0-9a-f]{64}$'),
  usuaria_id  text NOT NULL REFERENCES cuentas(usuaria_id) ON DELETE CASCADE,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  caduca_en   timestamptz NOT NULL
);
CREATE INDEX sesiones_usuaria_idx ON sesiones (usuaria_id);

-- 4) Mínimo privilegio para el rol de la web (regla de la migración 009).
--    La web puede crear usuarias y cuentas, pero NO puede fijar `rol` (columna sin permiso de escritura):
--    una cuenta `admin` solo nace con `npm run cuenta` (rol `horma`, desde la terminal de Mar).
GRANT SELECT ON cuentas, sesiones TO horma_web;
GRANT INSERT ON usuarias TO horma_web;
GRANT INSERT (usuaria_id, email, hash, google_sub, email_verificado) ON cuentas TO horma_web;
GRANT UPDATE (hash, google_sub, email_verificado, fallos, bloqueada_hasta) ON cuentas TO horma_web;
GRANT INSERT, DELETE ON sesiones TO horma_web;
-- Aprobar y marcar enviada desde la web (bloque 4): solo estas columnas de candidaturas.
GRANT UPDATE (estado, historial, actualizado_en) ON candidaturas TO horma_web;
