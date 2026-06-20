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
