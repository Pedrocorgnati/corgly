-- Ledger de ocupacao externa como intervalo proprio.
--
-- A ocupacao da agenda do professor passa a viver em TABELA PROPRIA, e nao como
-- bandeira em slot existente: `generateSlots` cria slot depois da sincronizacao e
-- uma bandeira nunca alcanca a linha que ainda nao existia quando o job rodou, e
-- um slot deletado e recriado perdia o bloqueio junto com a linha. A linha desta
-- tabela existe mesmo sem slot nenhum no horario e sobrevive a regeneracao dos
-- slots que ela cobre; a projecao no slot (blockOrigin GOOGLE) e feita pelo
-- servico, reaproveitando blockSlot/unblockSlot com CAS.
--
-- Nao ha backfill: nenhuma linha de ocupacao externa pode existir antes desta
-- tabela, porque nenhum escritor de agenda externa esta ligado no produto ate
-- este ponto do loop. Ela nasce vazia de proposito.
--
-- `revokedAt` e o carimbo de revogacao (NULL = ocupacao vigente), em vez de
-- boolean de ativo ou hard delete: o historico e insumo dos itens de politica de
-- conflito e de reconciliacao que consomem este ledger.
--
-- Sem coluna de provedor: toda linha e ocupacao da agenda Google do professor
-- unico (F8 do FEATURE-DESIGN), e `BlockOrigin.GOOGLE` ja e o vocabulario da
-- origem no slot. Debito declarado para o dia em que um segundo provedor chegar.
--
-- Sem `CHECK (endAt > startAt)`: o Prisma nao modela CHECK e a constraint em SQL
-- cru apareceria como drift em toda comparacao schema-versus-banco. O invariante
-- fica no servico, como `EXTERNAL_BUSY_001`.

-- CreateTable
CREATE TABLE `external_busy_intervals` (
    `id` VARCHAR(191) NOT NULL,
    `externalEventId` VARCHAR(255) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UNIQUE_external_busy_externalEventId`(`externalEventId`),
    INDEX `IDX_external_busy_revokedAt_startAt`(`revokedAt`, `startAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
