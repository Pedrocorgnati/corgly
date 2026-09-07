-- CreateTable
CREATE TABLE `users` (
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
    `preferred_currency` ENUM('USD', 'BRL', 'EUR', 'USDC') NULL,
    `onboardingCompletedAt` DATETIME(3) NULL,
    `termsAcceptedAt` DATETIME(3) NULL,
    `termsVersion` VARCHAR(10) NOT NULL DEFAULT '1.0',
    `marketingOptIn` BOOLEAN NOT NULL DEFAULT false,
    `deletionRequestedAt` DATETIME(3) NULL,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
    `mfaEnabledAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `deletionCancellationToken` VARCHAR(191) NULL,
    `deletionCancellationExpires` DATETIME(3) NULL,
    `stripeCustomerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_stripeCustomerId_key`(`stripeCustomerId`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_emailConfirmToken_idx`(`emailConfirmToken`),
    INDEX `users_resetPasswordToken_idx`(`resetPasswordToken`),
    INDEX `users_deletionRequestedAt_idx`(`deletionRequestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `magic_link_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `requesterIp` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `magic_link_tokens_tokenHash_key`(`tokenHash`),
    INDEX `magic_link_tokens_userId_idx`(`userId`),
    INDEX `magic_link_tokens_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_batches` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('SINGLE', 'PACK_5', 'PACK_10', 'MONTHLY', 'PROMO', 'MANUAL', 'REFUND') NOT NULL,
    `totalCredits` INTEGER NOT NULL,
    `usedCredits` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `stripePaymentIntentId` VARCHAR(191) NULL,
    `reason` VARCHAR(500) NULL,
    `lastExpiryEmailSent` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `credit_batches_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    INDEX `credit_batches_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `availability_slots` (
    `id` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `isBlocked` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `availability_slots_startAt_key`(`startAt`),
    INDEX `IDX_availability_startAt_isBlocked`(`startAt`, `isBlocked`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurring_patterns` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `recurring_patterns_studentId_isActive_idx`(`studentId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `availabilitySlotId` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_STUDENT', 'CANCELLED_BY_ADMIN', 'NO_SHOW_STUDENT', 'NO_SHOW_ADMIN', 'INTERRUPTED', 'RESCHEDULE_PENDING') NOT NULL DEFAULT 'SCHEDULED',
    `creditBatchId` VARCHAR(191) NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    `recurringPatternId` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelledBy` ENUM('STUDENT', 'ADMIN') NULL,
    `completedAt` DATETIME(3) NULL,
    `interruptedAt` DATETIME(3) NULL,
    `extendedBy` INTEGER NULL,
    `reminderSentAt` JSON NULL,
    `rescheduleRequestSlotId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sessions_availabilitySlotId_key`(`availabilitySlotId`),
    INDEX `sessions_studentId_status_idx`(`studentId`, `status`),
    INDEX `sessions_startAt_idx`(`startAt`),
    INDEX `sessions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_health` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `participantId` VARCHAR(191) NULL,
    `participantRole` ENUM('STUDENT', 'ADMIN') NOT NULL,
    `eventType` ENUM('METRIC_SNAPSHOT', 'CONNECTION_STATE', 'RECONNECT_ATTEMPT', 'RECONNECT_SUCCESS', 'RECONNECT_FAILED') NOT NULL DEFAULT 'METRIC_SNAPSHOT',
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `latencyMs` INTEGER NULL,
    `jitterMs` INTEGER NULL,
    `packetLossPercent` DECIMAL(5, 2) NULL,
    `webrtcState` ENUM('NEW', 'CHECKING', 'CONNECTED', 'COMPLETED', 'DISCONNECTED', 'FAILED', 'CLOSED') NOT NULL,
    `reconnectAttempt` INTEGER NOT NULL DEFAULT 0,
    `reconnectReason` VARCHAR(255) NULL,
    `reconnectSuccessful` BOOLEAN NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `session_health_sessionId_occurredAt_idx`(`sessionId`, `occurredAt`),
    INDEX `session_health_sessionId_participantRole_occurredAt_idx`(`sessionId`, `participantRole`, `occurredAt`),
    INDEX `session_health_participantId_occurredAt_idx`(`participantId`, `occurredAt`),
    INDEX `session_health_webrtcState_occurredAt_idx`(`webrtcState`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('DATA_EXPORT', 'TRANSCRIPTION', 'EMAIL_DELIVERY', 'REPORT_EXPORT', 'CLEANUP') NOT NULL,
    `queueName` VARCHAR(80) NOT NULL DEFAULT 'default',
    `payload` JSON NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `scheduledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(120) NULL,
    `finalErrorCode` VARCHAR(80) NULL,
    `finalErrorMessage` TEXT NULL,
    `finalErrorAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `jobs_status_scheduledAt_idx`(`status`, `scheduledAt`),
    INDEX `jobs_type_status_idx`(`type`, `status`),
    INDEX `jobs_queueName_status_priority_scheduledAt_idx`(`queueName`, `status`, `priority`, `scheduledAt`),
    INDEX `jobs_createdById_createdAt_idx`(`createdById`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_impersonation_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `endedById` VARCHAR(191) NULL,
    `endReason` ENUM('ADMIN_ENDED', 'TTL_EXPIRED', 'STUDENT_PASSWORD_RESET', 'SECURITY_REVIEW', 'SYSTEM_REVOKED') NULL,
    `reason` VARCHAR(500) NOT NULL,
    `ipAddress` VARCHAR(45) NOT NULL,
    `userAgent` VARCHAR(512) NOT NULL,
    `activeAdminKey` VARCHAR(191) NULL,
    `activeStudentKey` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_impersonation_sessions_activeAdminKey_key`(`activeAdminKey`),
    UNIQUE INDEX `admin_impersonation_sessions_activeStudentKey_key`(`activeStudentKey`),
    INDEX `admin_impersonation_sessions_adminId_startedAt_idx`(`adminId`, `startedAt`),
    INDEX `admin_impersonation_sessions_studentId_startedAt_idx`(`studentId`, `startedAt`),
    INDEX `admin_impersonation_sessions_expiresAt_idx`(`expiresAt`),
    INDEX `admin_impersonation_sessions_endedAt_idx`(`endedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedbacks` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `listeningScore` INTEGER NOT NULL,
    `speakingScore` INTEGER NOT NULL,
    `writingScore` INTEGER NOT NULL,
    `vocabularyScore` INTEGER NOT NULL,
    `overallFeedback` TEXT NULL,
    `listeningFeedback` TEXT NULL,
    `speakingFeedback` TEXT NULL,
    `writingFeedback` TEXT NULL,
    `vocabularyFeedback` TEXT NULL,
    `adminId` VARCHAR(191) NULL,
    `privateNote` TEXT NULL,
    `reviewed` BOOLEAN NOT NULL DEFAULT false,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `feedbacks_sessionId_key`(`sessionId`),
    INDEX `feedbacks_adminId_idx`(`adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stripePaymentIntentId` VARCHAR(191) NOT NULL,
    `stripeEventId` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'usd',
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED') NOT NULL,
    `creditBatchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_stripePaymentIntentId_key`(`stripePaymentIntentId`),
    UNIQUE INDEX `payments_stripeEventId_key`(`stripeEventId`),
    UNIQUE INDEX `payments_creditBatchId_key`(`creditBatchId`),
    INDEX `payments_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refund_requests` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `status` ENUM('PENDING', 'STRIPE_PROCESSING', 'STRIPE_FAILED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `refund_requests_userId_idx`(`userId`),
    UNIQUE INDEX `refund_requests_paymentId_userId_key`(`paymentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stripe_webhook_events` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(120) NOT NULL,
    `status` ENUM('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED') NOT NULL DEFAULT 'RECEIVED',
    `payload` JSON NULL,
    `rawPayload` LONGTEXT NULL,
    `errorMessage` TEXT NULL,
    `processedAt` DATETIME(3) NULL,
    `lastReplayAt` DATETIME(3) NULL,
    `replayCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stripe_webhook_events_eventId_key`(`eventId`),
    INDEX `stripe_webhook_events_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `stripe_webhook_events_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stripeSubscriptionId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'CANCELLED', 'PAST_DUE', 'PAUSED', 'TRIAL') NOT NULL,
    `weeklyFrequency` INTEGER NOT NULL,
    `monthlyLessons` INTEGER NULL,
    `currentPeriodStart` DATETIME(3) NOT NULL,
    `currentPeriodEnd` DATETIME(3) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriptions_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    INDEX `subscriptions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_documents` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `yjsState` LONGBLOB NULL,
    `plainTextSnapshot` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `session_documents_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_note_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `contentHash` VARCHAR(191) NOT NULL,
    `plainTextSnapshot` LONGTEXT NULL,
    `yjsState` LONGBLOB NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `session_note_snapshots_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
    UNIQUE INDEX `session_note_snapshots_sessionId_version_key`(`sessionId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contents` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` ENUM('VIDEO', 'ARTICLE') NOT NULL,
    `youtubeUrl` VARCHAR(500) NULL,
    `description` TEXT NULL,
    `transcript` TEXT NULL,
    `language` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `category` VARCHAR(80) NULL,
    `publishedAt` DATETIME(3) NULL,
    `authorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contents_isPublished_sortOrder_idx`(`isPublished`, `sortOrder`),
    INDEX `contents_status_publishedAt_idx`(`status`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_translations` (
    `id` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `locale` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(200) NOT NULL,
    `excerpt` TEXT NULL,
    `body` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `content_translations_locale_idx`(`locale`),
    UNIQUE INDEX `content_translations_contentId_locale_key`(`contentId`, `locale`),
    UNIQUE INDEX `content_translations_locale_slug_key`(`locale`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cookie_consents` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `sessionFingerprint` VARCHAR(191) NULL,
    `essentialAccepted` BOOLEAN NOT NULL DEFAULT true,
    `analyticsAccepted` BOOLEAN NOT NULL DEFAULT false,
    `marketingAccepted` BOOLEAN NOT NULL DEFAULT false,
    `consentVersion` VARCHAR(20) NOT NULL DEFAULT '1.0',
    `legalTextVersion` VARCHAR(20) NOT NULL DEFAULT '1.0',
    `source` ENUM('COOKIE_BANNER', 'ACCOUNT_SETTINGS', 'CHECKOUT', 'ADMIN', 'IMPORT') NOT NULL DEFAULT 'COOKIE_BANNER',
    `acceptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastPreferenceSetAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cookie_consents_consentVersion_idx`(`consentVersion`),
    UNIQUE INDEX `cookie_consents_userId_key`(`userId`),
    UNIQUE INDEX `cookie_consents_sessionFingerprint_key`(`sessionFingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cookie_consent_history` (
    `id` VARCHAR(191) NOT NULL,
    `consentId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `sessionFingerprint` VARCHAR(191) NULL,
    `essentialAccepted` BOOLEAN NOT NULL DEFAULT true,
    `analyticsAccepted` BOOLEAN NOT NULL DEFAULT false,
    `marketingAccepted` BOOLEAN NOT NULL DEFAULT false,
    `consentVersion` VARCHAR(20) NOT NULL,
    `legalTextVersion` VARCHAR(20) NOT NULL,
    `source` ENUM('COOKIE_BANNER', 'ACCOUNT_SETTINGS', 'CHECKOUT', 'ADMIN', 'IMPORT') NOT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` JSON NULL,

    INDEX `cookie_consent_history_consentId_changedAt_idx`(`consentId`, `changedAt`),
    INDEX `cookie_consent_history_userId_changedAt_idx`(`userId`, `changedAt`),
    INDEX `cookie_consent_history_sessionFingerprint_changedAt_idx`(`sessionFingerprint`, `changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `resourceType` VARCHAR(191) NOT NULL,
    `resourceId` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_adminId_createdAt_idx`(`adminId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_mfa` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `secretEnc` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `confirmedAt` DATETIME(3) NULL,
    `lastVerifiedAt` DATETIME(3) NULL,
    `lastUsedCounter` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_mfa_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mfa_recovery_codes` (
    `id` VARCHAR(191) NOT NULL,
    `mfaId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mfa_recovery_codes_mfaId_idx`(`mfaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_tickets` (
    `id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `status` ENUM('OPEN', 'PENDING', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `userId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `support_tickets_status_priority_idx`(`status`, `priority`),
    INDEX `support_tickets_userId_idx`(`userId`),
    INDEX `support_tickets_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_messages` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `authorRole` ENUM('STUDENT', 'ADMIN', 'SYSTEM') NOT NULL,
    `body` TEXT NOT NULL,
    `isInternal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_messages_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
    INDEX `support_messages_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referrals` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `referrerId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `referrals_code_key`(`code`),
    INDEX `referrals_referrerId_idx`(`referrerId`),
    INDEX `referrals_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referral_invites` (
    `id` VARCHAR(191) NOT NULL,
    `referralId` VARCHAR(191) NOT NULL,
    `invitedEmail` VARCHAR(191) NOT NULL,
    `invitedUserId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    `acceptedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `referral_invites_invitedUserId_idx`(`invitedUserId`),
    INDEX `referral_invites_status_idx`(`status`),
    UNIQUE INDEX `referral_invites_referralId_invitedEmail_key`(`referralId`, `invitedEmail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referral_credits` (
    `id` VARCHAR(191) NOT NULL,
    `referralId` VARCHAR(191) NOT NULL,
    `inviteId` VARCHAR(191) NOT NULL,
    `beneficiaryUserId` VARCHAR(191) NOT NULL,
    `creditBatchId` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'GRANTED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    `grantedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `referral_credits_inviteId_key`(`inviteId`),
    UNIQUE INDEX `referral_credits_creditBatchId_key`(`creditBatchId`),
    INDEX `referral_credits_beneficiaryUserId_idx`(`beneficiaryUserId`),
    INDEX `referral_credits_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flags` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `description` VARCHAR(280) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `rolloutPercentage` INTEGER NOT NULL DEFAULT 0,
    `scope` ENUM('GLOBAL', 'ROLE', 'COHORT') NOT NULL DEFAULT 'GLOBAL',
    `targetRole` ENUM('STUDENT', 'ADMIN') NULL,
    `targetCohort` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `feature_flags_key_key`(`key`),
    INDEX `feature_flags_enabled_idx`(`enabled`),
    INDEX `feature_flags_scope_idx`(`scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_overrides` (
    `id` VARCHAR(191) NOT NULL,
    `flagId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `reason` VARCHAR(280) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `feature_flag_overrides_userId_idx`(`userId`),
    UNIQUE INDEX `feature_flag_overrides_flagId_userId_key`(`flagId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_audits` (
    `id` VARCHAR(191) NOT NULL,
    `flagId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` ENUM('CREATED', 'ENABLED', 'DISABLED', 'ROLLOUT_CHANGED', 'SCOPE_CHANGED', 'OVERRIDE_SET', 'OVERRIDE_CLEARED') NOT NULL,
    `fromEnabled` BOOLEAN NULL,
    `toEnabled` BOOLEAN NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feature_flag_audits_flagId_createdAt_idx`(`flagId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` VARCHAR(191) NOT NULL,
    `origin` ENUM('LANDING', 'METHOD', 'CONTACT') NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NULL,
    `message` TEXT NULL,
    `locale` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL DEFAULT 'PT_BR',
    `consentGiven` BOOLEAN NOT NULL DEFAULT false,
    `consentAt` DATETIME(3) NULL,
    `status` ENUM('NEW', 'CONTACTED', 'CONVERTED', 'SPAM', 'ARCHIVED') NOT NULL DEFAULT 'NEW',
    `ipHash` VARCHAR(64) NULL,
    `userAgent` VARCHAR(400) NULL,
    `honeypotHit` BOOLEAN NOT NULL DEFAULT false,
    `spamScore` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leads_email_origin_createdAt_idx`(`email`, `origin`, `createdAt`),
    INDEX `leads_status_idx`(`status`),
    INDEX `leads_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_requests` (
    `id` VARCHAR(191) NOT NULL,
    `referenceCode` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `type` ENUM('EXPORT', 'RECTIFICATION', 'PORTABILITY', 'DELETION') NOT NULL,
    `channel` ENUM('WEB_PORTAL', 'EMAIL', 'SUPPORT', 'ADMIN') NOT NULL,
    `requesterEmail` VARCHAR(254) NOT NULL,
    `requesterEmailVerifiedAt` DATETIME(3) NULL,
    `status` ENUM('PENDING_EMAIL_VERIFICATION', 'PENDING', 'IN_PROGRESS', 'EXPORT_READY', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
    `signedArchiveUrl` VARCHAR(1000) NULL,
    `signedArchiveSha256` VARCHAR(64) NULL,
    `signedArchiveExpiresAt` DATETIME(3) NULL,
    `slaDueAt` DATETIME(3) NOT NULL,
    `correctionPayload` JSON NULL,
    `metadata` JSON NULL,
    `completedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `data_requests_referenceCode_key`(`referenceCode`),
    INDEX `data_requests_userId_status_idx`(`userId`, `status`),
    INDEX `data_requests_requesterEmail_status_idx`(`requesterEmail`, `status`),
    INDEX `data_requests_status_slaDueAt_idx`(`status`, `slaDueAt`),
    INDEX `data_requests_type_status_idx`(`type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_request_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `dataRequestId` VARCHAR(191) NOT NULL,
    `queueName` VARCHAR(80) NOT NULL DEFAULT 'privacy.data-request',
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `scheduledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `errorCode` VARCHAR(80) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `data_request_jobs_dataRequestId_key`(`dataRequestId`),
    INDEX `data_request_jobs_status_scheduledAt_idx`(`status`, `scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NULL,
    `contentId` VARCHAR(191) NULL,
    `type` ENUM('VIDEO', 'AUDIO', 'DOCUMENT', 'IMAGE', 'OTHER') NOT NULL,
    `storageProvider` ENUM('LOCAL', 'S3', 'R2', 'VERCEL_BLOB', 'EXTERNAL') NOT NULL DEFAULT 'LOCAL',
    `storageKey` VARCHAR(500) NOT NULL,
    `originalFilename` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `fileSizeBytes` BIGINT NOT NULL,
    `checksumSha256` VARCHAR(64) NULL,
    `publicUrl` VARCHAR(1000) NULL,
    `durationSeconds` INTEGER NULL,
    `language` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NULL,
    `processingStatus` ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED') NOT NULL DEFAULT 'PENDING',
    `processingError` TEXT NULL,
    `metadata` JSON NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_storageKey_key`(`storageKey`),
    INDEX `assets_ownerId_processingStatus_idx`(`ownerId`, `processingStatus`),
    INDEX `assets_sessionId_processingStatus_idx`(`sessionId`, `processingStatus`),
    INDEX `assets_contentId_processingStatus_idx`(`contentId`, `processingStatus`),
    INDEX `assets_type_processingStatus_idx`(`type`, `processingStatus`),
    INDEX `assets_language_idx`(`language`),
    INDEX `assets_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transcripts` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `language` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `provider` VARCHAR(80) NULL,
    `rawText` LONGTEXT NOT NULL,
    `normalizedText` LONGTEXT NULL,
    `confidence` DOUBLE NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `transcripts_status_language_idx`(`status`, `language`),
    INDEX `transcripts_assetId_status_idx`(`assetId`, `status`),
    UNIQUE INDEX `transcripts_assetId_language_key`(`assetId`, `language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `captions` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `transcriptId` VARCHAR(191) NULL,
    `language` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `format` ENUM('VTT', 'SRT', 'TXT') NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `storageKey` VARCHAR(500) NULL,
    `publicUrl` VARCHAR(1000) NULL,
    `content` LONGTEXT NULL,
    `generatedAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `captions_assetId_status_idx`(`assetId`, `status`),
    INDEX `captions_language_status_idx`(`language`, `status`),
    INDEX `captions_transcriptId_idx`(`transcriptId`),
    UNIQUE INDEX `captions_assetId_language_format_key`(`assetId`, `language`, `format`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_templates` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('CONFIRM_EMAIL', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'BOOKING_REMINDER_24H', 'BOOKING_REMINDER_1H', 'PASSWORD_RESET', 'CREDIT_EXPIRY_WARNING', 'PAYMENT_RECEIPT', 'SUBSCRIPTION_CANCELLED', 'BULK_CANCEL_NOTIFICATION', 'PURCHASE_CONFIRMED', 'SUBSCRIPTION_PAYMENT_FAILED', 'SESSION_INTERRUPTED', 'RECURRING_BOOKING_FAILED', 'ACCOUNT_DELETION_REQUESTED', 'DATA_EXPORT_READY', 'FEEDBACK_AVAILABLE', 'BOOKING_RESCHEDULED', 'MARKETING_BROADCAST') NOT NULL,
    `locale` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `channel` ENUM('EMAIL') NOT NULL DEFAULT 'EMAIL',
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('DRAFT', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `subject` VARCHAR(180) NOT NULL,
    `preheader` VARCHAR(180) NULL,
    `htmlBody` LONGTEXT NOT NULL,
    `textBody` LONGTEXT NULL,
    `variables` JSON NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `email_templates_type_locale_status_idx`(`type`, `locale`, `status`),
    INDEX `email_templates_status_updatedAt_idx`(`status`, `updatedAt`),
    UNIQUE INDEX `email_templates_type_locale_channel_version_key`(`type`, `locale`, `channel`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `type` ENUM('CONFIRM_EMAIL', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'BOOKING_REMINDER_24H', 'BOOKING_REMINDER_1H', 'PASSWORD_RESET', 'CREDIT_EXPIRY_WARNING', 'PAYMENT_RECEIPT', 'SUBSCRIPTION_CANCELLED', 'BULK_CANCEL_NOTIFICATION', 'PURCHASE_CONFIRMED', 'SUBSCRIPTION_PAYMENT_FAILED', 'SESSION_INTERRUPTED', 'RECURRING_BOOKING_FAILED', 'ACCOUNT_DELETION_REQUESTED', 'DATA_EXPORT_READY', 'FEEDBACK_AVAILABLE', 'BOOKING_RESCHEDULED', 'MARKETING_BROADCAST') NOT NULL,
    `locale` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL,
    `channel` ENUM('EMAIL') NOT NULL DEFAULT 'EMAIL',
    `toEmail` VARCHAR(254) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `provider` VARCHAR(80) NULL,
    `providerMessageId` VARCHAR(191) NULL,
    `status` ENUM('QUEUED', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'QUEUED',
    `subject` VARCHAR(180) NOT NULL,
    `renderedHtml` LONGTEXT NULL,
    `renderedText` LONGTEXT NULL,
    `data` JSON NULL,
    `errorCode` VARCHAR(80) NULL,
    `errorMessage` TEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `failedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `email_deliveries_providerMessageId_key`(`providerMessageId`),
    INDEX `email_deliveries_templateId_status_idx`(`templateId`, `status`),
    INDEX `email_deliveries_userId_status_idx`(`userId`, `status`),
    INDEX `email_deliveries_type_locale_status_idx`(`type`, `locale`, `status`),
    INDEX `email_deliveries_status_queuedAt_idx`(`status`, `queuedAt`),
    INDEX `email_deliveries_toEmail_idx`(`toEmail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fx_rates` (
    `id` VARCHAR(191) NOT NULL,
    `baseCurrency` ENUM('USD', 'BRL', 'EUR', 'USDC') NOT NULL DEFAULT 'USD',
    `quoteCurrency` ENUM('USD', 'BRL', 'EUR', 'USDC') NOT NULL,
    `rate` DECIMAL(18, 8) NOT NULL,
    `source` ENUM('MANUAL', 'STRIPE', 'OPEN_EXCHANGE_RATES', 'COINGECKO', 'SEED') NOT NULL,
    `roundingPolicy` ENUM('HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEIL') NOT NULL DEFAULT 'HALF_UP',
    `validFrom` DATETIME(3) NOT NULL,
    `validUntil` DATETIME(3) NULL,
    `collectedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fx_rates_baseCurrency_quoteCurrency_validFrom_validUntil_idx`(`baseCurrency`, `quoteCurrency`, `validFrom`, `validUntil`),
    INDEX `fx_rates_source_collectedAt_idx`(`source`, `collectedAt`),
    UNIQUE INDEX `fx_rates_baseCurrency_quoteCurrency_source_validFrom_key`(`baseCurrency`, `quoteCurrency`, `source`, `validFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

    INDEX `legal_docs_type_locale_status_effectiveAt_idx`(`type`, `locale`, `status`, `effectiveAt`),
    INDEX `legal_docs_contentHashSha256_idx`(`contentHashSha256`),
    UNIQUE INDEX `legal_docs_type_locale_version_key`(`type`, `locale`, `version`),
    UNIQUE INDEX `legal_docs_locale_slug_version_key`(`locale`, `slug`, `version`),
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

    INDEX `term_acceptances_userId_acceptedAt_idx`(`userId`, `acceptedAt`),
    INDEX `term_acceptances_type_version_idx`(`type`, `version`),
    UNIQUE INDEX `term_acceptances_userId_legalDocId_key`(`userId`, `legalDocId`),
    UNIQUE INDEX `term_acceptances_userId_type_version_key`(`userId`, `type`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onboarding_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `currentLevel` ENUM('BEGINNER', 'ELEMENTARY', 'INTERMEDIATE', 'UPPER_INTERMEDIATE', 'ADVANCED', 'PROFICIENT') NOT NULL DEFAULT 'BEGINNER',
    `preferredLanguage` ENUM('PT_BR', 'EN_US', 'ES_ES', 'IT_IT') NOT NULL DEFAULT 'EN_US',
    `timezone` VARCHAR(100) NOT NULL,
    `currentStep` ENUM('WELCOME', 'PROFILE', 'GOALS', 'PREFERENCES', 'EQUIPMENT_CHECK', 'COMPLETED') NOT NULL DEFAULT 'WELCOME',
    `preferences` JSON NULL,
    `notes` TEXT NULL,
    `completedAt` DATETIME(3) NULL,
    `skippedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `onboarding_profiles_userId_key`(`userId`),
    INDEX `onboarding_profiles_currentStep_updatedAt_idx`(`currentStep`, `updatedAt`),
    INDEX `onboarding_profiles_preferredLanguage_idx`(`preferredLanguage`),
    INDEX `onboarding_profiles_timezone_idx`(`timezone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `language_goals` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `type` ENUM('CONVERSATION', 'BUSINESS', 'TRAVEL', 'EXAM_PREP', 'CULTURE', 'PRONUNCIATION', 'GRAMMAR', 'OTHER') NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `targetDate` DATETIME(3) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `language_goals_profileId_priority_idx`(`profileId`, `priority`),
    INDEX `language_goals_type_idx`(`type`),
    UNIQUE INDEX `language_goals_profileId_type_key`(`profileId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_slot_locks` (
    `slotId` VARCHAR(191) NOT NULL,
    `owner` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IDX_booking_slot_locks_expiresAt`(`expiresAt`),
    PRIMARY KEY (`slotId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_idempotency_records` (
    `idempotencyKey` VARCHAR(255) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(255) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `resultJson` JSON NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IDX_booking_idempotency_student`(`studentId`),
    INDEX `IDX_booking_idempotency_expiresAt`(`expiresAt`),
    PRIMARY KEY (`idempotencyKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `billing_idempotency_records` (
    `idempotencyKey` VARCHAR(255) NOT NULL,
    `scope` VARCHAR(64) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(64) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `resultJson` JSON NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IDX_billing_idempotency_scope_owner`(`scope`, `ownerId`),
    INDEX `IDX_billing_idempotency_expiresAt`(`expiresAt`),
    PRIMARY KEY (`idempotencyKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `magic_link_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_batches` ADD CONSTRAINT `credit_batches_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurring_patterns` ADD CONSTRAINT `recurring_patterns_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_availabilitySlotId_fkey` FOREIGN KEY (`availabilitySlotId`) REFERENCES `availability_slots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_creditBatchId_fkey` FOREIGN KEY (`creditBatchId`) REFERENCES `credit_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_recurringPatternId_fkey` FOREIGN KEY (`recurringPatternId`) REFERENCES `recurring_patterns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_health` ADD CONSTRAINT `session_health_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_health` ADD CONSTRAINT `session_health_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_impersonation_sessions` ADD CONSTRAINT `admin_impersonation_sessions_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_impersonation_sessions` ADD CONSTRAINT `admin_impersonation_sessions_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_impersonation_sessions` ADD CONSTRAINT `admin_impersonation_sessions_endedById_fkey` FOREIGN KEY (`endedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_creditBatchId_fkey` FOREIGN KEY (`creditBatchId`) REFERENCES `credit_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_requests` ADD CONSTRAINT `refund_requests_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_requests` ADD CONSTRAINT `refund_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_documents` ADD CONSTRAINT `session_documents_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_note_snapshots` ADD CONSTRAINT `session_note_snapshots_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_translations` ADD CONSTRAINT `content_translations_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cookie_consents` ADD CONSTRAINT `cookie_consents_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cookie_consent_history` ADD CONSTRAINT `cookie_consent_history_consentId_fkey` FOREIGN KEY (`consentId`) REFERENCES `cookie_consents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cookie_consent_history` ADD CONSTRAINT `cookie_consent_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_mfa` ADD CONSTRAINT `user_mfa_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mfa_recovery_codes` ADD CONSTRAINT `mfa_recovery_codes_mfaId_fkey` FOREIGN KEY (`mfaId`) REFERENCES `user_mfa`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `support_tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_invites` ADD CONSTRAINT `referral_invites_referralId_fkey` FOREIGN KEY (`referralId`) REFERENCES `referrals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_invites` ADD CONSTRAINT `referral_invites_invitedUserId_fkey` FOREIGN KEY (`invitedUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_credits` ADD CONSTRAINT `referral_credits_referralId_fkey` FOREIGN KEY (`referralId`) REFERENCES `referrals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_credits` ADD CONSTRAINT `referral_credits_inviteId_fkey` FOREIGN KEY (`inviteId`) REFERENCES `referral_invites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referral_credits` ADD CONSTRAINT `referral_credits_beneficiaryUserId_fkey` FOREIGN KEY (`beneficiaryUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_overrides` ADD CONSTRAINT `feature_flag_overrides_flagId_fkey` FOREIGN KEY (`flagId`) REFERENCES `feature_flags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_overrides` ADD CONSTRAINT `feature_flag_overrides_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_flag_audits` ADD CONSTRAINT `feature_flag_audits_flagId_fkey` FOREIGN KEY (`flagId`) REFERENCES `feature_flags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_requests` ADD CONSTRAINT `data_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_request_jobs` ADD CONSTRAINT `data_request_jobs_dataRequestId_fkey` FOREIGN KEY (`dataRequestId`) REFERENCES `data_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `contents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transcripts` ADD CONSTRAINT `transcripts_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `captions` ADD CONSTRAINT `captions_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `captions` ADD CONSTRAINT `captions_transcriptId_fkey` FOREIGN KEY (`transcriptId`) REFERENCES `transcripts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_deliveries` ADD CONSTRAINT `email_deliveries_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `email_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_deliveries` ADD CONSTRAINT `email_deliveries_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `term_acceptances` ADD CONSTRAINT `term_acceptances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `term_acceptances` ADD CONSTRAINT `term_acceptances_legalDocId_fkey` FOREIGN KEY (`legalDocId`) REFERENCES `legal_docs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `onboarding_profiles` ADD CONSTRAINT `onboarding_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `language_goals` ADD CONSTRAINT `language_goals_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `onboarding_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_slot_locks` ADD CONSTRAINT `booking_slot_locks_slotId_fkey` FOREIGN KEY (`slotId`) REFERENCES `availability_slots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_idempotency_records` ADD CONSTRAINT `booking_idempotency_records_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

