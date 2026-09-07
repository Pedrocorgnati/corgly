-- Exercicios Fase 1: 4 enums, 6 tabelas novas, 17 FKs. Puramente aditiva.
--
-- O `prisma migrate dev` que gerou este arquivo tinha anexado no topo um bloco
-- destrutivo (DROP das tabelas `billing_idempotency_records`,
-- `booking_idempotency_records` e `booking_slot_locks`). Esse bloco NAO
-- pertence a esta entrega: as tres tabelas nascem no baseline
-- `20260906010000_baseline_schema_reconciliado`, ficam de proposito fora do
-- datamodel e sao operadas por SQL cru em `src/lib/billing/idempotency.service.ts`
-- e `src/lib/bookings/booking-idempotency.service.ts`. O Prisma as le como
-- drift porque nao ha model correspondente. Bloco removido a mao; as tabelas
-- foram recriadas no banco de dev a partir do DDL do baseline. Enquanto os
-- models nao existirem, todo `migrate dev` seguinte vai reanexar esse DROP.

-- CreateTable
CREATE TABLE `exercises` (
    `id` VARCHAR(191) NOT NULL,
    `internalTitle` VARCHAR(200) NOT NULL,
    `supportLanguage` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `level` INTEGER NOT NULL,
    `subject` VARCHAR(80) NULL,
    `tags` JSON NULL,
    `timeEstimateMin` INTEGER NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `exercises_status_supportLanguage_idx`(`status`, `supportLanguage`),
    INDEX `exercises_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exercise_translations` (
    `id` VARCHAR(191) NOT NULL,
    `exerciseId` VARCHAR(191) NOT NULL,
    `locale` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `summary` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exercise_translations_exerciseId_locale_key`(`exerciseId`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exercise_items` (
    `id` VARCHAR(191) NOT NULL,
    `exerciseId` VARCHAR(191) NOT NULL,
    `kind` ENUM('MULTIPLE_CHOICE', 'MATCH_CLICK', 'AUDIO_WORD', 'AUDIO_CLOZE', 'AUDIO_SENTENCE', 'AUDIO_CHOICE', 'AUDIO_ORDER', 'TEXT_CHOICE', 'VERB_CLOZE', 'IMAGE_WORD', 'IMAGE_CHOICE', 'IMAGE_SPEAK', 'AUDIO_SHADOW', 'L1_SPEAK_PT') NOT NULL,
    `position` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `answerKey` JSON NOT NULL,
    `acceptWithoutAccent` BOOLEAN NOT NULL DEFAULT false,
    `maxSeconds` INTEGER NULL,
    `promptAudioAssetId` VARCHAR(191) NULL,
    `answerAudioAssetId` VARCHAR(191) NULL,
    `imageAssetId` VARCHAR(191) NULL,
    `imageAlt` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exercise_items_exerciseId_position_key`(`exerciseId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exercise_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `exerciseId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `grantedById` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `firstSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `exercise_assignments_studentId_status_idx`(`studentId`, `status`),
    UNIQUE INDEX `exercise_assignments_exerciseId_studentId_key`(`exerciseId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exercise_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `exerciseId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED', 'ABANDONED') NOT NULL DEFAULT 'IN_PROGRESS',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `answeredCount` INTEGER NOT NULL DEFAULT 0,
    `correctCount` INTEGER NOT NULL DEFAULT 0,
    `itemCount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `exercise_attempts_studentId_status_idx`(`studentId`, `status`),
    INDEX `exercise_attempts_exerciseId_finishedAt_idx`(`exerciseId`, `finishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exercise_item_answers` (
    `id` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `isCorrect` BOOLEAN NOT NULL,
    `transcript` TEXT NULL,
    `recordingAssetId` VARCHAR(191) NULL,
    `answeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exercise_item_answers_attemptId_itemId_key`(`attemptId`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exercises` ADD CONSTRAINT `exercises_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_translations` ADD CONSTRAINT `exercise_translations_exerciseId_fkey` FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_items` ADD CONSTRAINT `exercise_items_exerciseId_fkey` FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_items` ADD CONSTRAINT `exercise_items_promptAudioAssetId_fkey` FOREIGN KEY (`promptAudioAssetId`) REFERENCES `assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_items` ADD CONSTRAINT `exercise_items_answerAudioAssetId_fkey` FOREIGN KEY (`answerAudioAssetId`) REFERENCES `assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_items` ADD CONSTRAINT `exercise_items_imageAssetId_fkey` FOREIGN KEY (`imageAssetId`) REFERENCES `assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_assignments` ADD CONSTRAINT `exercise_assignments_exerciseId_fkey` FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_assignments` ADD CONSTRAINT `exercise_assignments_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_assignments` ADD CONSTRAINT `exercise_assignments_grantedById_fkey` FOREIGN KEY (`grantedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_attempts` ADD CONSTRAINT `exercise_attempts_exerciseId_fkey` FOREIGN KEY (`exerciseId`) REFERENCES `exercises`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_attempts` ADD CONSTRAINT `exercise_attempts_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_attempts` ADD CONSTRAINT `exercise_attempts_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `exercise_assignments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_item_answers` ADD CONSTRAINT `exercise_item_answers_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `exercise_attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_item_answers` ADD CONSTRAINT `exercise_item_answers_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `exercise_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exercise_item_answers` ADD CONSTRAINT `exercise_item_answers_recordingAssetId_fkey` FOREIGN KEY (`recordingAssetId`) REFERENCES `assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
