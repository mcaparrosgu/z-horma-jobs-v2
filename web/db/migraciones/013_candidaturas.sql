-- Candidaturas (Flujos D y E): CV y carta adaptados a una oferta, con su traza, huecos y cobertura ATS.
-- Aditiva y reversible: DROP TABLE candidaturas;  (no toca ninguna tabla existente).
-- Se borra con su usuaria (ON DELETE CASCADE, RGPD) y con su oferta. Datos personales: solo la ve su dueña.
-- La web solo LEE: aprobar y enviar se hacen en Claude Code (/aprobar, /marcar-enviada); un agente nunca escribe «aprobada».
CREATE TABLE candidaturas (
  usuaria_id    text NOT NULL REFERENCES usuarias(id) ON DELETE CASCADE,
  oferta_id     text NOT NULL REFERENCES ofertas(id) ON DELETE CASCADE,
  estado        text NOT NULL CHECK (estado IN ('borrador','aprobada','enviada','entrevista','rechazada','sin_respuesta','descartada','pendiente_de_ti')),
  cv_usado      text NOT NULL CHECK (cv_usado IN ('adaptado','estetico')),
  cv_md         text NOT NULL CHECK (char_length(cv_md) BETWEEN 1 AND 30000),
  carta_md      text CHECK (char_length(carta_md) <= 10000),
  historial     jsonb NOT NULL,
  traza         jsonb NOT NULL,
  traza_carta   jsonb,
  huecos        jsonb NOT NULL,
  ats           jsonb NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuaria_id, oferta_id)
);
CREATE INDEX candidaturas_usuaria_idx ON candidaturas (usuaria_id, estado);

-- REGLA de la migración 009: toda tabla nueva que la web lea necesita su GRANT SELECT.
GRANT SELECT ON candidaturas TO horma_web;
