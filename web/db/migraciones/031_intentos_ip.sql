-- B4-7 (revisión del 7-nov): límite de intentos FALLIDOS de entrada por IP (hoy solo se bloquea la cuenta: quien sepa un
-- correo puede bloquearla 15 min, y probar contraseñas contra muchas cuentas no deja huella común). Guarda solo un hash de
-- la IP (nunca la IP en claro), un contador y el inicio de la ventana; las filas de más de 1 hora se borran solas al
-- consultar. La IP es un dato personal: base legal = seguridad (interés legítimo); entra en el texto de privacidad que Mar
-- revisa antes de abrir a usuarias reales. No hay datos de la usuaria ni de la cuenta aquí.
-- Reversible: DROP TABLE intentos_ip;
CREATE TABLE intentos_ip (
  clave          text PRIMARY KEY CHECK (char_length(clave) = 64),
  fallos         integer NOT NULL CHECK (fallos >= 0),
  ventana_inicio timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intentos_ip_ventana_idx ON intentos_ip (ventana_inicio);
GRANT SELECT, INSERT, UPDATE, DELETE ON intentos_ip TO horma_web;
