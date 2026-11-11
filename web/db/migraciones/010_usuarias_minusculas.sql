-- Los ids de usuaria van siempre en minúsculas.
-- Motivo (revisor de seguridad, 6-nov): en Windows «Ana» y «ana» son la misma carpeta en disco, pero en la base
-- eran dos usuarias distintas; exportar o borrar a una podía tocar los datos de otra. Con este CHECK la base lo impide.
-- Si ya existiera un id con mayúsculas, la migración falla entera (y no cambia nada): renómbralo antes a mano.
-- Reversible: ALTER TABLE usuarias DROP CONSTRAINT usuarias_id_minusculas;
ALTER TABLE usuarias ADD CONSTRAINT usuarias_id_minusculas CHECK (id = lower(id));
