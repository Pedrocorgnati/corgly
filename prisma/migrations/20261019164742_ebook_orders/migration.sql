-- Persistencia do modulo de ebooks (item 003): pedido, token de acesso, ledger
-- de entrega, idempotencia de webhook e log de acesso.
--
-- Por que: o pedido guarda o resultado da Checkout Session, o marco de
-- consentimento de arrependimento (evidence item-001 secao 5.2) e os marcos de
-- reembolso e contestacao (secao 5.7); o token de acesso guarda so o hash
-- SHA-256, porque o token cru nunca e persistido (secao 5.7), e a relacao 1:N
-- com o pedido permite reemissao futura sem migration; o ledger de entrega e
-- append-only e guarda evento, resultado e detalhe sem PII (regra O22: nunca
-- email, token ou payload); a idempotencia de webhook tem tabela propria
-- (evidence item-001 secao 3) porque o Stripe entrega o mesmo evt_ a todo
-- endpoint inscrito e reusar stripe_webhook_events faria um endpoint descartar
-- um evento que nunca processou.
--
-- Nao ha backfill necessario: todas as tabelas sao novas e as linhas chegam
-- pelos fluxos dos itens 004 a 008.
-- CreateTable
CREATE TABLE `ebook_orders` (
    `id` VARCHAR(191) NOT NULL,
    `checkoutSessionId` VARCHAR(255) NOT NULL,
    `stripePaymentIntentId` VARCHAR(255) NULL,
    `slug` VARCHAR(64) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `locale` VARCHAR(8) NOT NULL,
    `amountTotal` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `paymentStatus` ENUM('PENDING', 'PAID', 'ASYNC_PENDING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED') NOT NULL DEFAULT 'PENDING',
    `deliveryStatus` ENUM('PENDING', 'CLAIMED', 'SENDING', 'ACCEPTED', 'DELIVERED', 'NEEDS_REVIEW') NOT NULL DEFAULT 'PENDING',
    `deliveryClaimId` VARCHAR(191) NULL,
    `deliveryClaimedAt` DATETIME(3) NULL,
    `deliveryAttempts` INTEGER NOT NULL DEFAULT 0,
    `purchasedAt` DATETIME(3) NOT NULL,
    `billingCountry` VARCHAR(2) NULL,
    `cardCountry` VARCHAR(2) NULL,
    `refundedAt` DATETIME(3) NULL,
    `refundedAmount` INTEGER NOT NULL DEFAULT 0,
    `disputedAt` DATETIME(3) NULL,
    `disputeId` VARCHAR(255) NULL,
    `disputeStatus` VARCHAR(40) NULL,
    `withdrawalWaiverAt` DATETIME(3) NULL,
    `withdrawalWaiverVersion` VARCHAR(40) NULL,
    `firstDownloadAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ebook_orders_checkoutSessionId_key`(`checkoutSessionId`),
    UNIQUE INDEX `ebook_orders_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    UNIQUE INDEX `ebook_orders_disputeId_key`(`disputeId`),
    INDEX `ebook_orders_paymentStatus_createdAt_idx`(`paymentStatus`, `createdAt`),
    INDEX `ebook_orders_deliveryStatus_updatedAt_idx`(`deliveryStatus`, `updatedAt`),
    INDEX `ebook_orders_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ebook_access_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `downloadCount` INTEGER NOT NULL DEFAULT 0,
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ebook_access_tokens_tokenHash_key`(`tokenHash`),
    INDEX `ebook_access_tokens_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ebook_delivery_events` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `event` VARCHAR(60) NOT NULL,
    `result` VARCHAR(40) NOT NULL,
    `detail` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ebook_delivery_events_orderId_createdAt_idx`(`orderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ebook_access_logs` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `tokenId` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(45) NOT NULL,
    `accessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ebook_access_logs_orderId_accessedAt_idx`(`orderId`, `accessedAt`),
    INDEX `ebook_access_logs_tokenId_idx`(`tokenId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ebook_webhook_events` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(255) NOT NULL,
    `type` VARCHAR(120) NOT NULL,
    `status` ENUM('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED') NOT NULL DEFAULT 'RECEIVED',
    `checkoutSessionId` VARCHAR(255) NULL,
    `claimedAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` TEXT NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ebook_webhook_events_eventId_key`(`eventId`),
    INDEX `ebook_webhook_events_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `ebook_webhook_events_checkoutSessionId_idx`(`checkoutSessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ebook_access_tokens` ADD CONSTRAINT `ebook_access_tokens_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `ebook_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ebook_delivery_events` ADD CONSTRAINT `ebook_delivery_events_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `ebook_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ebook_access_logs` ADD CONSTRAINT `ebook_access_logs_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `ebook_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ebook_access_logs` ADD CONSTRAINT `ebook_access_logs_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `ebook_access_tokens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

