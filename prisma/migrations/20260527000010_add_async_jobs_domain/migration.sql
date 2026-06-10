-- Create generic async jobs domain for DSR exports, transcriptions and operational workers
CREATE TABLE `jobs` (
  `id`                VARCHAR(191) NOT NULL,
  `type`              ENUM('DATA_EXPORT','TRANSCRIPTION','EMAIL_DELIVERY','REPORT_EXPORT','CLEANUP') NOT NULL,
  `queueName`         VARCHAR(80) NOT NULL DEFAULT 'default',
  `payload`           JSON NOT NULL,
  `status`            ENUM('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `attempts`          INTEGER NOT NULL DEFAULT 0,
  `maxAttempts`       INTEGER NOT NULL DEFAULT 3,
  `priority`          INTEGER NOT NULL DEFAULT 0,
  `scheduledAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `startedAt`         DATETIME(3) NULL,
  `completedAt`       DATETIME(3) NULL,
  `lockedAt`          DATETIME(3) NULL,
  `lockedBy`          VARCHAR(120) NULL,
  `finalErrorCode`    VARCHAR(80) NULL,
  `finalErrorMessage` TEXT NULL,
  `finalErrorAt`      DATETIME(3) NULL,
  `createdById`       VARCHAR(191) NULL,
  `createdAt`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`         DATETIME(3) NOT NULL,

  INDEX `jobs_status_scheduledAt_idx` (`status`, `scheduledAt`),
  INDEX `jobs_type_status_idx` (`type`, `status`),
  INDEX `jobs_queueName_status_priority_scheduledAt_idx` (`queueName`, `status`, `priority`, `scheduledAt`),
  INDEX `jobs_createdById_createdAt_idx` (`createdById`, `createdAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `jobs`
  ADD CONSTRAINT `jobs_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
