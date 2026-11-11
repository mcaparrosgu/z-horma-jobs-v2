-- Las ofertas que publica una empresa guardan el sector y la familia que ella eligió (antes se perdían: el INSERT no los
-- incluía y horma_web no tenía permiso). Solo INSERT: tras publicar no se editan (SQL_EDITAR_OFERTA no los toca).
-- ADITIVA. Rollback: REVOKE INSERT (sector, familia) ON ofertas FROM horma_web;
GRANT INSERT (sector, familia) ON ofertas TO horma_web;
