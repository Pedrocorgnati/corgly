-- Entrega recuperavel do aviso de conflito de agenda (item 025).
--
-- A unique (intervalId, sessionId) evita linhas duplicadas, mas nao evita que
-- duas sincronizacoes concorrentes enviem o mesmo email. O claim abaixo e um
-- lease persistido: somente uma execucao adquire o direito de enviar, e uma
-- execucao futura pode recuperar o trabalho se o lease expirar ou for liberado
-- depois de erro. `notificationAttempts` e `notificationLastError` preservam a
-- trilha operacional sem transformar falha de email em falha da sincronizacao.
--
-- Nao ha backfill necessario. Linhas ainda nao notificadas ficam imediatamente
-- elegiveis; linhas com `notifiedAt` preenchido continuam concluidas.

ALTER TABLE `external_busy_conflicts`
    ADD COLUMN `notificationClaimId` VARCHAR(191) NULL,
    ADD COLUMN `notificationClaimedAt` DATETIME(3) NULL,
    ADD COLUMN `notificationAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `notificationLastError` VARCHAR(500) NULL;
