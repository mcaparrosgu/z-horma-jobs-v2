-- B4-4 (revisión del 7-nov): los textos de una empresa pasan por el detector de instrucciones embebidas
-- (src/lib/instrucciones-embebidas.ts) al publicar Y al editar. Al publicar ya se escribe `auditoria` (INSERT permitido);
-- al editar hace falta poder actualizarla, para que un texto editado no conserve una detección vieja.
-- Coste de privilegio: la web (código de la empresa, con sesión de empresa) podría escribir también las otras claves de
-- `auditoria` (fantasma, fraude, empresa_validada) de las ofertas de su empresa; la consulta de edición solo toca
-- `instrucciones_embebidas` (jsonb_set) y la oferta sigue pasando por moderación humana antes de verse.
-- Reversible: REVOKE UPDATE (auditoria) ON ofertas FROM horma_web;
GRANT UPDATE (auditoria) ON ofertas TO horma_web;
