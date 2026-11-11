-- Recomendaciones (Flujo C): la nota y la explicación de cada oferta para cada usuaria, por versión de perfil.
-- Aditiva y reversible: DROP TABLE matches;  (no toca ninguna tabla existente).
-- Se borra con su usuaria (ON DELETE CASCADE, RGPD) y con su oferta. La nota es solo experiencia y formación;
-- nivel_condiciones solo condiciones de trabajo (esquema match). Nunca se muestra a empresas.
CREATE TABLE matches (
  usuaria_id        text NOT NULL REFERENCES usuarias(id) ON DELETE CASCADE,
  oferta_id         text NOT NULL REFERENCES ofertas(id) ON DELETE CASCADE,
  version_perfil    text NOT NULL CHECK (char_length(version_perfil) BETWEEN 1 AND 80),
  fecha             date NOT NULL,
  nota              smallint NOT NULL CHECK (nota BETWEEN 0 AND 100),
  nivel_condiciones text NOT NULL CHECK (nivel_condiciones IN ('encaja', 'parcial', 'no')),
  explicacion       text NOT NULL CHECK (char_length(explicacion) BETWEEN 1 AND 1500),
  sin_sueldo        boolean NOT NULL DEFAULT false,
  correccion        text CHECK (char_length(correccion) <= 1500),
  PRIMARY KEY (usuaria_id, oferta_id, version_perfil)
);
CREATE INDEX matches_usuaria_nota_idx ON matches (usuaria_id, nota DESC);

-- La web solo lee (REGLA de la migración 009: toda tabla nueva que la web lea necesita su GRANT SELECT).
GRANT SELECT ON matches TO horma_web;
