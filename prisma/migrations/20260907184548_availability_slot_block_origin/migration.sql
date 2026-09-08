-- Origem do bloqueio em availability_slots.
--
-- `isBlocked` dizia apenas SE o slot esta bloqueado, nunca POR QUEM: dois motivos de
-- bloqueio na mesma linha se sobrescreviam sem deixar rastro. A coluna `blockOrigin`
-- acrescenta a dimensao que falta - MANUAL (professor), GOOGLE (agenda externa) e BOTH
-- (os dois simultaneos, independentes) - de modo que desfazer um bloqueio nao desfaca o
-- outro. `isBlocked` permanece como coluna mantida, projecao da origem, porque seis
-- consumidores a leem, dois deles em SQL cru.
--
-- A ordem importa: o backfill abaixo depende da coluna ja existir, e so pode afirmar que
-- todo bloqueio atual e manual porque esta migration entra ANTES de qualquer integracao
-- de calendario existir no produto.

-- AlterTable
ALTER TABLE `availability_slots` ADD COLUMN `blockOrigin` ENUM('MANUAL', 'GOOGLE', 'BOTH') NULL;

-- Backfill: nao existe integracao de calendario no produto ate este ponto do loop,
-- entao toda linha hoje bloqueada e bloqueio manual do professor.
UPDATE `availability_slots` SET `blockOrigin` = 'MANUAL' WHERE `isBlocked` = 1;
