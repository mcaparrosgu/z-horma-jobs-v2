-- 001_inicial.sql · Tablas de la primera entrega de la pista B (ingesta y candidatos).
-- Traducen los esquemas de .claude/skills/esquemas-horma/schemas/.
-- Sin BEGIN/COMMIT: scripts/migrar.mjs la ejecuta dentro de una transacción.


-- Quién es la usuaria. Solo un identificador; el login llega más adelante.
CREATE TABLE usuarias (
  id         text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$'),
  creada_en  timestamptz NOT NULL DEFAULT now()
);

-- Registro de portales (endpoints.json). Lo mantiene el equipo, no cada usuaria.
-- La clave de API NUNCA se guarda aquí: solo el nombre de la variable de entorno.
CREATE TABLE fuentes (
  nombre         text PRIMARY KEY,
  url            text NOT NULL,
  metodo         text NOT NULL CHECK (metodo = 'GET'),
  parametros     jsonb NOT NULL DEFAULT '{}',
  cabeceras      jsonb NOT NULL DEFAULT '{}',
  clave_env      text,
  clave_en       text CHECK (clave_en IN ('cabecera', 'parametro')),
  clave_nombre   text,
  mapeo_campos   jsonb NOT NULL,
  activa         boolean NOT NULL DEFAULT false
);

-- Una fila por cada vez que se ingesta un portal (el "resumen por corrida").
CREATE TABLE corridas_ingesta (
  id          bigserial PRIMARY KEY,
  fuente      text NOT NULL REFERENCES fuentes(nombre),
  inicio      timestamptz NOT NULL,
  fin         timestamptz,
  entraron    integer NOT NULL DEFAULT 0 CHECK (entraron >= 0),
  descartadas integer NOT NULL DEFAULT 0 CHECK (descartadas >= 0),
  errores     jsonb NOT NULL DEFAULT '[]'
);

-- Ofertas procesadas (oferta.json). Son comunes a todas las usuarias.
-- Columnas para lo que se filtra; JSONB para lo que se muestra entero.
-- "fuente" es texto libre (no clave foránea) porque una empresa también puede publicar una oferta.
CREATE TABLE ofertas (
  id          text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$'),
  fuente      text NOT NULL,
  url         text NOT NULL,
  fecha       date,
  titulo      text NOT NULL,
  empresa     text NOT NULL,
  ubicacion   text NOT NULL,
  pais        text CHECK (pais ~ '^[A-Z]{2}$'),
  remoto      text NOT NULL CHECK (remoto IN ('presencial', 'hibrido', 'remoto', 'no_indicado')),
  contrato    text NOT NULL,
  idioma      text NOT NULL,
  nivel       text NOT NULL CHECK (nivel IN ('practicas', 'junior', 'medio', 'senior', 'direccion', 'no_indicado')),
  sector      text,
  familia     text,
  requisitos  jsonb NOT NULL DEFAULT '[]',
  salario     jsonb NOT NULL,
  stack       jsonb NOT NULL DEFAULT '[]',
  auditoria   jsonb NOT NULL,
  corrida_id  bigint REFERENCES corridas_ingesta(id),
  creada_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ofertas_filtro_idx ON ofertas (sector, familia, nivel, remoto);

-- Perfil de la candidata (perfil.json). Cada dato lleva su "origen" (de qué parte del CV salió)
-- dentro del JSON: sin origen no hay trazabilidad, y sin trazabilidad no hay honestidad.
CREATE TABLE perfiles (
  usuaria_id              text PRIMARY KEY REFERENCES usuarias(id) ON DELETE CASCADE,
  experiencias            jsonb NOT NULL DEFAULT '[]',
  formacion               jsonb NOT NULL DEFAULT '[]',
  skills                  jsonb NOT NULL DEFAULT '[]',
  idiomas                 jsonb NOT NULL DEFAULT '[]',
  taxonomia               jsonb NOT NULL,
  preguntas_pendientes    jsonb NOT NULL DEFAULT '[]',
  instrucciones_embebidas jsonb NOT NULL DEFAULT '[]',
  actualizado_en          timestamptz NOT NULL DEFAULT now()
);

-- Preferencias (preferencias.json). Las edita la usuaria.
-- Sin edad, nacionalidad ni categorías especiales (RGPD art. 9): ni siquiera hay columna para ellas.
CREATE TABLE preferencias (
  usuaria_id            text PRIMARY KEY REFERENCES usuarias(id) ON DELETE CASCADE,
  puestos               text[] NOT NULL DEFAULT '{}',
  ciudades              text[] NOT NULL DEFAULT '{}',
  paises                text[] NOT NULL DEFAULT '{}',
  remoto                text[] NOT NULL DEFAULT '{}' CHECK (remoto <@ ARRAY['presencial', 'hibrido', 'remoto']),
  contrato              text[] NOT NULL DEFAULT '{}',
  idiomas               text[] NOT NULL DEFAULT '{}',
  sectores              text[] NOT NULL DEFAULT '{}',
  niveles               text[] NOT NULL DEFAULT '{}',
  sueldo_min            numeric,
  rango_compatibilidad  integer[] NOT NULL CHECK (
    array_length(rango_compatibilidad, 1) = 2
    AND rango_compatibilidad[1] BETWEEN 0 AND 100
    AND rango_compatibilidad[2] BETWEEN 0 AND 100
  ),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);

-- Observabilidad: un evento por cada cosa que hace cada componente.
-- REGLA: "detalle" nunca lleva datos personales (nombres, emails, texto de CV).
CREATE TABLE eventos (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  componente   text NOT NULL,
  accion       text NOT NULL,
  resultado    text NOT NULL CHECK (resultado IN ('ok', 'error')),
  duracion_ms  integer CHECK (duracion_ms >= 0),
  detalle      jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX eventos_ts_idx ON eventos (ts DESC);
CREATE INDEX eventos_componente_idx ON eventos (componente, ts DESC);

