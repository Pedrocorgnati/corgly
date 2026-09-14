-- A migracao da aula 1 usa internalTitle como chave natural de idempotencia.
-- O indice tambem impede que duas execucoes concorrentes criem o mesmo exercicio.
CREATE UNIQUE INDEX `UNIQUE_exercises_internalTitle` ON `exercises`(`internalTitle`);
