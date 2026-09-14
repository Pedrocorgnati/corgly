-- Ledger de conflitos entre ocupacao externa e aula JA VENDIDA (item 025).
--
-- O conflito ja existia no runtime, mas so vivia em memoria: `blockSlot` recusa
-- bloquear slot com sessao ativa (`AVAILABILITY_051`), a projecao registrava o
-- caso num array de resposta e o request terminava. A aula sobrevivia (F8: o job
-- de sincronizacao NUNCA cancela, reagenda ou toca sessao vendida), mas o
-- professor jamais ficava sabendo que aquele horario estava duplamente
-- comprometido. Esta tabela transforma o conflito efemero em fato duravel e
-- comunicado.
--
-- Esta tabela NAO cancela nada. Ela registra `(ocupacao, slot, sessao)` e o
-- ciclo de vida do fato: `detectedAt` (quando a projecao viu), `notifiedAt`
-- (quando o professor foi avisado, NULL enquanto nao foi) e `resolvedAt` (quando
-- a causa desapareceu — ocupacao revogada no Google ou sessao cancelada e slot
-- finalmente bloqueado). A decisao sobre a aula continua sendo humana.
--
-- Tabela propria pelo mesmo motivo que `external_busy_intervals` nao virou
-- bandeira em slot no item 016: o conflito e fato historico com ciclo de vida
-- proprio e precisa sobreviver a regeneracao dos slots que ele referencia.
--
-- `UNIQUE (intervalId, sessionId)` e o que torna o re-sync idempotente: cada
-- passada do job reencontra a linha do par em vez de criar duplicata e mandar
-- email novo. Sem ele, um evento recorrente viraria spam.
--
-- `motivo` e VARCHAR(32) com default, nao enum: um motivo novo (sessao em outro
-- fuso, por exemplo) nao deve exigir migration de enum.
--
-- Sem `CHECK`: o Prisma nao modela CHECK e a constraint em SQL cru apareceria
-- como drift em toda comparacao schema-versus-banco (mesma decisao do item 016).
--
-- Nao ha backfill: os conflitos anteriores a esta tabela nunca foram
-- persistidos em lugar nenhum e nao ha de onde recupera-los. A tabela nasce
-- vazia e o proximo sync repovoa os conflitos ainda vigentes.

-- CreateTable
CREATE TABLE `external_busy_conflicts` (
    `id` VARCHAR(191) NOT NULL,
    `intervalId` VARCHAR(191) NOT NULL,
    `slotId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `motivo` VARCHAR(32) NOT NULL DEFAULT 'SESSAO_VIVA',
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notifiedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IDX_external_busy_conflict_open`(`resolvedAt`, `detectedAt`),
    INDEX `IDX_external_busy_conflict_slotId`(`slotId`),
    UNIQUE INDEX `UNIQUE_external_busy_conflict_interval_session`(`intervalId`, `sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `external_busy_conflicts` ADD CONSTRAINT `external_busy_conflicts_intervalId_fkey` FOREIGN KEY (`intervalId`) REFERENCES `external_busy_intervals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `external_busy_conflicts` ADD CONSTRAINT `external_busy_conflicts_slotId_fkey` FOREIGN KEY (`slotId`) REFERENCES `availability_slots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `external_busy_conflicts` ADD CONSTRAINT `external_busy_conflicts_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
