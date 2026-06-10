-- CreateTable
CREATE TABLE `legal_docs` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('TERMS', 'PRIVACY', 'COOKIES', 'DPA') NOT NULL,
    `locale` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL DEFAULT 'PT_BR',
    `version` VARCHAR(40) NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `title` VARCHAR(180) NOT NULL,
    `slug` VARCHAR(200) NOT NULL,
    `bodyMarkdown` LONGTEXT NOT NULL,
    `contentHashSha256` VARCHAR(64) NOT NULL,
    `effectiveAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `requiresAcceptance` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `legal_docs_type_locale_version_key`(`type`, `locale`, `version`),
    UNIQUE INDEX `legal_docs_locale_slug_version_key`(`locale`, `slug`, `version`),
    INDEX `legal_docs_type_locale_status_effectiveAt_idx`(`type`, `locale`, `status`, `effectiveAt`),
    INDEX `legal_docs_contentHashSha256_idx`(`contentHashSha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `term_acceptances` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `legalDocId` VARCHAR(191) NOT NULL,
    `type` ENUM('TERMS', 'PRIVACY', 'COOKIES', 'DPA') NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `acceptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source` ENUM('REGISTER', 'CHECKOUT', 'LOGIN_BLOCKER', 'ACCOUNT_SETTINGS', 'ADMIN_IMPORT') NOT NULL DEFAULT 'LOGIN_BLOCKER',
    `ipHash` VARCHAR(64) NULL,
    `userAgent` VARCHAR(400) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `term_acceptances_userId_legalDocId_key`(`userId`, `legalDocId`),
    UNIQUE INDEX `term_acceptances_userId_type_version_key`(`userId`, `type`, `version`),
    INDEX `term_acceptances_userId_acceptedAt_idx`(`userId`, `acceptedAt`),
    INDEX `term_acceptances_type_version_idx`(`type`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `term_acceptances` ADD CONSTRAINT `term_acceptances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `term_acceptances` ADD CONSTRAINT `term_acceptances_legalDocId_fkey` FOREIGN KEY (`legalDocId`) REFERENCES `legal_docs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
