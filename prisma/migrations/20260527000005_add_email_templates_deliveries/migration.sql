-- Create versioned email templates and delivery logs
CREATE TABLE `email_templates` (
  `id`          VARCHAR(191) NOT NULL,
  `type`        ENUM(
    'CONFIRM_EMAIL',
    'BOOKING_CONFIRMED',
    'BOOKING_CANCELLED',
    'BOOKING_REMINDER_24H',
    'BOOKING_REMINDER_1H',
    'PASSWORD_RESET',
    'CREDIT_EXPIRY_WARNING',
    'PAYMENT_RECEIPT',
    'SUBSCRIPTION_CANCELLED',
    'BULK_CANCEL_NOTIFICATION',
    'PURCHASE_CONFIRMED',
    'SUBSCRIPTION_PAYMENT_FAILED',
    'SESSION_INTERRUPTED',
    'RECURRING_BOOKING_FAILED',
    'ACCOUNT_DELETION_REQUESTED',
    'DATA_EXPORT_READY',
    'FEEDBACK_AVAILABLE',
    'BOOKING_RESCHEDULED'
  ) NOT NULL,
  `locale`      ENUM('PT_BR','EN_US','ES_ES','IT_IT') NOT NULL,
  `channel`     ENUM('EMAIL') NOT NULL DEFAULT 'EMAIL',
  `version`     INTEGER NOT NULL DEFAULT 1,
  `status`      ENUM('DRAFT','ACTIVE','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `subject`     VARCHAR(180) NOT NULL,
  `preheader`   VARCHAR(180) NULL,
  `htmlBody`    LONGTEXT NOT NULL,
  `textBody`    LONGTEXT NULL,
  `variables`   JSON NULL,
  `publishedAt` DATETIME(3) NULL,
  `archivedAt`  DATETIME(3) NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3) NOT NULL,

  UNIQUE INDEX `email_templates_type_locale_channel_version_key` (`type`, `locale`, `channel`, `version`),
  INDEX `email_templates_type_locale_status_idx` (`type`, `locale`, `status`),
  INDEX `email_templates_status_updatedAt_idx` (`status`, `updatedAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `email_deliveries` (
  `id`                VARCHAR(191) NOT NULL,
  `templateId`        VARCHAR(191) NULL,
  `type`              ENUM(
    'CONFIRM_EMAIL',
    'BOOKING_CONFIRMED',
    'BOOKING_CANCELLED',
    'BOOKING_REMINDER_24H',
    'BOOKING_REMINDER_1H',
    'PASSWORD_RESET',
    'CREDIT_EXPIRY_WARNING',
    'PAYMENT_RECEIPT',
    'SUBSCRIPTION_CANCELLED',
    'BULK_CANCEL_NOTIFICATION',
    'PURCHASE_CONFIRMED',
    'SUBSCRIPTION_PAYMENT_FAILED',
    'SESSION_INTERRUPTED',
    'RECURRING_BOOKING_FAILED',
    'ACCOUNT_DELETION_REQUESTED',
    'DATA_EXPORT_READY',
    'FEEDBACK_AVAILABLE',
    'BOOKING_RESCHEDULED'
  ) NOT NULL,
  `locale`            ENUM('PT_BR','EN_US','ES_ES','IT_IT') NOT NULL,
  `channel`           ENUM('EMAIL') NOT NULL DEFAULT 'EMAIL',
  `toEmail`           VARCHAR(254) NOT NULL,
  `userId`            VARCHAR(191) NULL,
  `provider`          VARCHAR(80) NULL,
  `providerMessageId` VARCHAR(191) NULL,
  `status`            ENUM('QUEUED','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'QUEUED',
  `subject`           VARCHAR(180) NOT NULL,
  `renderedHtml`      LONGTEXT NULL,
  `renderedText`      LONGTEXT NULL,
  `data`              JSON NULL,
  `errorCode`         VARCHAR(80) NULL,
  `errorMessage`      TEXT NULL,
  `attempts`          INTEGER NOT NULL DEFAULT 0,
  `queuedAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sentAt`            DATETIME(3) NULL,
  `failedAt`          DATETIME(3) NULL,
  `createdAt`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`         DATETIME(3) NOT NULL,

  UNIQUE INDEX `email_deliveries_providerMessageId_key` (`providerMessageId`),
  INDEX `email_deliveries_templateId_status_idx` (`templateId`, `status`),
  INDEX `email_deliveries_userId_status_idx` (`userId`, `status`),
  INDEX `email_deliveries_type_locale_status_idx` (`type`, `locale`, `status`),
  INDEX `email_deliveries_status_queuedAt_idx` (`status`, `queuedAt`),
  INDEX `email_deliveries_toEmail_idx` (`toEmail`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `email_deliveries`
  ADD CONSTRAINT `email_deliveries_templateId_fkey`
    FOREIGN KEY (`templateId`) REFERENCES `email_templates`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `email_deliveries`
  ADD CONSTRAINT `email_deliveries_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
