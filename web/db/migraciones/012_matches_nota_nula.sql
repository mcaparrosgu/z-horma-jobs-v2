-- Esquema 0.7: la nota puede ser NULL («sin datos suficientes en la oferta»). Aditiva en la práctica: solo quita el NOT NULL.
-- Se deshace con: ALTER TABLE matches ALTER COLUMN nota SET NOT NULL;  (falla si ya hay notas nulas).
-- El CHECK (nota BETWEEN 0 AND 100) sigue valiendo: con NULL no se cumple ni se incumple.
ALTER TABLE matches ALTER COLUMN nota DROP NOT NULL;
