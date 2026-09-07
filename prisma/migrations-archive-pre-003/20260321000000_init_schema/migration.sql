-- CreateEnum
CREATE TABLE `_prisma_migrations` (
    `id`                    VARCHAR(36)     NOT NULL,
    `checksum`              VARCHAR(64)     NOT NULL,
    `finished_at`           DATETIME(3),
    `migration_name`        VARCHAR(255)    NOT NULL,
    `logs`                  TEXT,
    `rolled_back_at`        DATETIME(3),
    `started_at`            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `applied_steps_count`   INTEGER UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateEnum: UserRole
-- CreateEnum: SessionStatus
-- CreateEnum: CreditType
-- CreateEnum: PaymentStatus
-- CreateEnum: SubscriptionStatus
-- CreateEnum: SupportedLanguage
-- CreateEnum: ContentType

-- CreateTable: User
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('STUDENT', 'ADMIN') NOT NULL DEFAULT 'STUDENT',
    `country` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NOT NULL,
    `emailConfirmed` BOOLEAN NOT NULL DEFAULT false,
    `emailConfirmToken` VARCHAR(191) NULL,
    `emailConfirmExpires` DATETIME(3) NULL,
    `resetPasswordToken` VARCHAR(191) NULL,
    `resetPasswordExpires` DATETIME(3) NULL,
    `maxFutureSessions` INTEGER NOT NULL DEFAULT 5,
    `isFirstPurchase` BOOLEAN NOT NULL DEFAULT true,
    `preferredLanguage` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL DEFAULT 'EN_US',
    `onboardingCompletedAt` DATETIME(3) NULL,
    `termsAcceptedAt` DATETIME(3) NOT NULL,
    `termsVersion` VARCHAR(10) NOT NULL DEFAULT '1.0',
    `marketingOptIn` BOOLEAN NOT NULL DEFAULT false,
    `deletionRequestedAt` DATETIME(3) NULL,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_emailConfirmToken_idx`(`emailConfirmToken`),
    INDEX `User_resetPasswordToken_idx`(`resetPasswordToken`),
    INDEX `User_deletionRequestedAt_idx`(`deletionRequestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: CreditBatch
CREATE TABLE `CreditBatch` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('SINGLE', 'PACK_5', 'PACK_10', 'MONTHLY', 'PROMO', 'MANUAL', 'REFUND') NOT NULL,
    `totalCredits` INTEGER NOT NULL,
    `usedCredits` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `stripePaymentIntentId` VARCHAR(191) NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CreditBatch_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    INDEX `CreditBatch_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: AvailabilitySlot
CREATE TABLE `AvailabilitySlot` (
    `id` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `isBlocked` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AvailabilitySlot_startAt_idx`(`startAt`),
    INDEX `AvailabilitySlot_startAt_isBlocked_idx`(`startAt`, `isBlocked`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: RecurringPattern
CREATE TABLE `RecurringPattern` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RecurringPattern_studentId_isActive_idx`(`studentId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Session
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `availabilitySlotId` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_STUDENT', 'CANCELLED_BY_ADMIN', 'NO_SHOW_STUDENT', 'NO_SHOW_ADMIN', 'INTERRUPTED', 'RESCHEDULE_PENDING') NOT NULL DEFAULT 'SCHEDULED',
    `creditBatchId` VARCHAR(191) NOT NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    `recurringPatternId` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelledBy` ENUM('STUDENT', 'ADMIN') NULL,
    `completedAt` DATETIME(3) NULL,
    `extendedBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_availabilitySlotId_key`(`availabilitySlotId`),
    INDEX `Session_studentId_status_idx`(`studentId`, `status`),
    INDEX `Session_startAt_idx`(`startAt`),
    INDEX `Session_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Feedback
CREATE TABLE `Feedback` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `listeningScore` INTEGER NOT NULL,
    `speakingScore` INTEGER NOT NULL,
    `writingScore` INTEGER NOT NULL,
    `vocabularyScore` INTEGER NOT NULL,
    `generalComment` TEXT NOT NULL,
    `strengths` TEXT NULL,
    `improvements` TEXT NULL,
    `topicsCovered` TEXT NULL,
    `recommendations` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Feedback_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Payment
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stripePaymentIntentId` VARCHAR(191) NOT NULL,
    `stripeEventId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'usd',
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL,
    `creditBatchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payment_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    UNIQUE INDEX `Payment_stripeEventId_key`(`stripeEventId`),
    UNIQUE INDEX `Payment_creditBatchId_key`(`creditBatchId`),
    INDEX `Payment_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Subscription
CREATE TABLE `Subscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stripeSubscriptionId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'CANCELLED', 'PAST_DUE') NOT NULL,
    `weeklyFrequency` INTEGER NOT NULL,
    `currentPeriodStart` DATETIME(3) NOT NULL,
    `currentPeriodEnd` DATETIME(3) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Subscription_userId_key`(`userId`),
    UNIQUE INDEX `Subscription_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: SessionDocument
CREATE TABLE `SessionDocument` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `yjsState` LONGBLOB NULL,
    `plainTextSnapshot` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SessionDocument_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Content
CREATE TABLE `Content` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` ENUM('VIDEO_GRAMMAR', 'VIDEO_VOCABULARY', 'VIDEO_PRONUNCIATION') NOT NULL,
    `youtubeUrl` VARCHAR(500) NOT NULL,
    `description` TEXT NULL,
    `transcript` TEXT NULL,
    `language` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Content_isPublished_sortOrder_idx`(`isPublished`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: CookieConsent
CREATE TABLE `CookieConsent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `sessionFingerprint` VARCHAR(191) NULL,
    `essentialAccepted` BOOLEAN NOT NULL DEFAULT true,
    `analyticsAccepted` BOOLEAN NOT NULL DEFAULT false,
    `marketingAccepted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CookieConsent_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: CreditBatch.userId -> User.id
ALTER TABLE `CreditBatch` ADD CONSTRAINT `CreditBatch_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: RecurringPattern.studentId -> User.id
ALTER TABLE `RecurringPattern` ADD CONSTRAINT `RecurringPattern_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Session.studentId -> User.id
ALTER TABLE `Session` ADD CONSTRAINT `Session_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Session.availabilitySlotId -> AvailabilitySlot.id
ALTER TABLE `Session` ADD CONSTRAINT `Session_availabilitySlotId_fkey`
    FOREIGN KEY (`availabilitySlotId`) REFERENCES `AvailabilitySlot`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Session.creditBatchId -> CreditBatch.id
ALTER TABLE `Session` ADD CONSTRAINT `Session_creditBatchId_fkey`
    FOREIGN KEY (`creditBatchId`) REFERENCES `CreditBatch`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Session.recurringPatternId -> RecurringPattern.id
ALTER TABLE `Session` ADD CONSTRAINT `Session_recurringPatternId_fkey`
    FOREIGN KEY (`recurringPatternId`) REFERENCES `RecurringPattern`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Feedback.sessionId -> Session.id
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Payment.userId -> User.id
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Payment.creditBatchId -> CreditBatch.id
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_creditBatchId_fkey`
    FOREIGN KEY (`creditBatchId`) REFERENCES `CreditBatch`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Subscription.userId -> User.id
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: SessionDocument.sessionId -> Session.id
ALTER TABLE `SessionDocument` ADD CONSTRAINT `SessionDocument_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: CookieConsent.userId -> User.id
ALTER TABLE `CookieConsent` ADD CONSTRAINT `CookieConsent_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
