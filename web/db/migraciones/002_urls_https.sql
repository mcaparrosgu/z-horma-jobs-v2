-- 002_urls_https.sql · Las URLs solo pueden ser http(s): frena javascript:, file:// y similares.
-- (Informe de revisor-seguridad, 5-nov.) El filtrado de IPs internas (SSRF) se hace en el código de ingesta.
ALTER TABLE fuentes ADD CONSTRAINT fuentes_url_http CHECK (url ~* '^https?://');
ALTER TABLE ofertas ADD CONSTRAINT ofertas_url_http CHECK (url ~* '^https?://');
