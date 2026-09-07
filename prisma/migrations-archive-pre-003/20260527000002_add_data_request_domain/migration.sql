-- CreateTable data_requests
CREATE TABLE `data_requests` (
  `id`                       VARCHAR(191) NOT NULL,
  `referenceCode`            VARCHAR(40) NOT NULL,
  `userId`                   VARCHAR(191) NULL,
  `type`                     ENUM('EXPORT','RECTIFICATION','PORTABILITY','DELETION') NOT NULL,
  `channel`                  ENUM('WEB_PORTAL','EMAIL','SUPPORT','ADMIN') NOT NULL,
  `requesterEmail`           VARCHAR(254) NOT NULL,
  `requesterEmailVerifiedAt` DATETIME(3) NULL,
  `status`                   ENUM('PENDING_EMAIL_VERIFICATION','PENDING','IN_PROGRESS','EXPORT_READY','COMPLETED','REJECTED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  `signedArchiveUrl`         VARCHAR(1000) NULL,
  `signedArchiveSha256`      VARCHAR(64) NULL,
  `signedArchiveExpiresAt`   DATETIME(3) NULL,
  `slaDueAt`                 DATETIME(3) NOT NULL,
  `correctionPayload`        JSON NULL,
  `metadata`                 JSON NULL,
  `completedAt`              DATETIME(3) NULL,
  `rejectedAt`               DATETIME(3) NULL,
  `rejectionReason`          TEXT NULL,
  `createdAt`                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`                DATETIME(3) NOT NULL,

  UNIQUE INDEX `data_requests_referenceCode_key` (`referenceCode`),
  INDEX `data_requests_userId_status_idx` (`userId`, `status`),
  INDEX `data_requests_requesterEmail_status_idx` (`requesterEmail`, `status`),
  INDEX `data_requests_status_slaDueAt_idx` (`status`, `slaDueAt`),
  INDEX `data_requests_type_status_idx` (`type`, `status`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable data_request_jobs
CREATE TABLE `data_request_jobs` (
  `id`            VARCHAR(191) NOT NULL,
  `dataRequestId` VARCHAR(191) NOT NULL,
  `queueName`     VARCHAR(80) NOT NULL DEFAULT 'privacy.data-request',
  `status`        ENUM('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `attempts`      INTEGER NOT NULL DEFAULT 0,
  `scheduledAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `startedAt`     DATETIME(3) NULL,
  `finishedAt`    DATETIME(3) NULL,
  `errorCode`     VARCHAR(80) NULL,
  `errorMessage`  TEXT NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3) NOT NULL,

  UNIQUE INDEX `data_request_jobs_dataRequestId_key` (`dataRequestId`),
  INDEX `data_request_jobs_status_scheduledAt_idx` (`status`, `scheduledAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey data_requests.userId -> users.id
ALTER TABLE `data_requests`
  ADD CONSTRAINT `data_requests_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey data_request_jobs.dataRequestId -> data_requests.id
ALTER TABLE `data_request_jobs`
  ADD CONSTRAINT `data_request_jobs_dataRequestId_fkey`
    FOREIGN KEY (`dataRequestId`) REFERENCES `data_requests`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
