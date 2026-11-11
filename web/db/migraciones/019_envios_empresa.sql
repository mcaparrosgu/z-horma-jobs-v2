-- Bloque 4 de la construcción autónoma (portal de empresas II): enviar una candidatura aprobada a la empresa y su
-- bandeja. Aditiva: tabla nueva; no toca ninguna existente.
-- Reversible: DROP TABLE envios_empresa;
CREATE TABLE envios_empresa (
  id              bigserial PRIMARY KEY,
  usuaria_id      text NOT NULL REFERENCES usuarias(id) ON DELETE CASCADE,
  oferta_id       text NOT NULL REFERENCES ofertas(id) ON DELETE CASCADE,
  empresa_id      text NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Copia CONGELADA de la versión aprobada: nunca se vuelve a leer `candidaturas` para esto, así que un cambio
  -- posterior a la candidatura no cambia lo que la empresa ya vio.
  cv_md           text NOT NULL CHECK (char_length(cv_md) BETWEEN 1 AND 30000),
  carta_md        text CHECK (char_length(carta_md) <= 10000),
  -- Solo si la usuaria marcó la casilla de compartir contacto; si no, los dos quedan NULL.
  contacto_nombre text CHECK (char_length(contacto_nombre) <= 200),
  contacto_email  text CHECK (char_length(contacto_email) <= 254),
  -- Valores cerrados, sin texto libre (línea roja: Horma no ordena ni filtra candidatas para empresas).
  estado_bandeja  text NOT NULL DEFAULT 'recibida' CHECK (estado_bandeja IN ('recibida', 'vista', 'en_proceso', 'no_seleccionada')),
  enviado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuaria_id, oferta_id)
);
-- El índice no lleva ninguna columna de "calidad": solo para listar rápido la bandeja de una oferta, en orden de llegada.
CREATE INDEX envios_empresa_bandeja_idx ON envios_empresa (empresa_id, oferta_id, enviado_en);

GRANT SELECT ON envios_empresa TO horma_web;
GRANT INSERT (usuaria_id, oferta_id, empresa_id, cv_md, carta_md, contacto_nombre, contacto_email) ON envios_empresa TO horma_web;
GRANT UPDATE (estado_bandeja) ON envios_empresa TO horma_web;
GRANT DELETE ON envios_empresa TO horma_web;
-- El INSERT necesita además USAGE sobre la secuencia del `bigserial` (igual que `eventos_id_seq`, migración 009).
GRANT USAGE ON SEQUENCE envios_empresa_id_seq TO horma_web;
