-- «Corrida» es un término de Argentina; en español de España se dice «ejecución».
ALTER TABLE corridas_ingesta RENAME TO ejecuciones_ingesta;
ALTER TABLE ofertas RENAME COLUMN corrida_id TO ejecucion_id;
