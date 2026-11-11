-- Calidad de ofertas (A1): identidad exacta, huella para agrupar duplicados y datos de vigencia. ADITIVA: solo columnas
-- e índices nuevos en `ofertas`; no cambia ni borra ningún dato existente y NO añade ninguna restricción UNIQUE.
-- Rollback (nada más depende de esto):
--   DROP INDEX IF EXISTS ofertas_url_canonica_idx, ofertas_huella_idx, ofertas_huella_base_idx;
--   ALTER TABLE ofertas DROP COLUMN url_canonica, DROP COLUMN huella, DROP COLUMN huella_base, DROP COLUMN grupo_dedup,
--     DROP COLUMN primera_vista, DROP COLUMN ultima_vista, DROP COLUMN veces_vista, DROP COLUMN fecha_cierre;
-- Las filas existentes quedan con valores neutros (cada una es su propio grupo); `npm run dedup` calcula url_canonica,
-- huella y grupo de las que ya había, sin tocar los contadores de vistas.
ALTER TABLE ofertas
  ADD COLUMN url_canonica  text,
  ADD COLUMN huella_base   text,                -- empresa + título + municipio (sin semana): para reconocer ofertas recurrentes
  ADD COLUMN huella        text,                -- la anterior + semana de `fecha`: misma huella = mismo grupo de duplicados
  ADD COLUMN grupo_dedup   text,                -- = huella; nulo = la oferta es su propio grupo
  ADD COLUMN primera_vista timestamptz DEFAULT now(),
  ADD COLUMN ultima_vista  timestamptz DEFAULT now(),
  ADD COLUMN veces_vista   integer NOT NULL DEFAULT 1 CHECK (veces_vista >= 1),
  ADD COLUMN fecha_cierre  date;

-- Valores neutros para lo que ya existía: la primera y la última vez que se vio es cuando se creó, y una vez.
UPDATE ofertas SET primera_vista = creada_en, ultima_vista = creada_en;
UPDATE ofertas SET url_canonica = url WHERE url_canonica IS NULL;

CREATE INDEX ofertas_url_canonica_idx ON ofertas (url_canonica);
CREATE INDEX ofertas_huella_idx       ON ofertas (huella);
CREATE INDEX ofertas_huella_base_idx  ON ofertas (huella_base);
