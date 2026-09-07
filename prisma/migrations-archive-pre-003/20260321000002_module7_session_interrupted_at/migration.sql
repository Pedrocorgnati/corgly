-- Module 7: Sala Virtual — adicionar campo interruptedAt à tabela sessions
-- Necessário para registrar timestamp de interrupção por falha de conexão ou encerramento do professor

ALTER TABLE `sessions`
  ADD COLUMN `interruptedAt` DATETIME(3) NULL AFTER `completedAt`;
