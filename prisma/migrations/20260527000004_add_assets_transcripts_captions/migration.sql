-- Create assets, transcripts and captions domain
CREATE TABLE `assets` (
  `id`               VARCHAR(191) NOT NULL,
  `ownerId`          VARCHAR(191) NULL,
  `sessionId`        VARCHAR(191) NULL,
  `contentId`        VARCHAR(191) NULL,
  `type`             ENUM('VIDEO','AUDIO','DOCUMENT','IMAGE','OTHER') NOT NULL,
  `storageProvider`  ENUM('LOCAL','S3','R2','VERCEL_BLOB','EXTERNAL') NOT NULL DEFAULT 'LOCAL',
  `storageKey`       VARCHAR(500) NOT NULL,
  `originalFilename` VARCHAR(255) NOT NULL,
  `mimeType`         VARCHAR(120) NOT NULL,
  `fileSizeBytes`    BIGINT NOT NULL,
  `checksumSha256`   VARCHAR(64) NULL,
  `publicUrl`        VARCHAR(1000) NULL,
  `durationSeconds`  INTEGER NULL,
  `language`         ENUM('PT_BR','EN_US','ES_ES','IT_IT') NULL,
  `processingStatus` ENUM('PENDING','PROCESSING','READY','FAILED','ARCHIVED') NOT NULL DEFAULT 'PENDING',
  `processingError`  TEXT NULL,
  `metadata`         JSON NULL,
  `uploadedAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt`      DATETIME(3) NULL,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3) NOT NULL,

  UNIQUE INDEX `assets_storageKey_key` (`storageKey`),
  INDEX `assets_ownerId_processingStatus_idx` (`ownerId`, `processingStatus`),
  INDEX `assets_sessionId_processingStatus_idx` (`sessionId`, `processingStatus`),
  INDEX `assets_contentId_processingStatus_idx` (`contentId`, `processingStatus`),
  INDEX `assets_type_processingStatus_idx` (`type`, `processingStatus`),
  INDEX `assets_language_idx` (`language`),
  INDEX `assets_createdAt_idx` (`createdAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `transcripts` (
  `id`             VARCHAR(191) NOT NULL,
  `assetId`        VARCHAR(191) NOT NULL,
  `language`       ENUM('PT_BR','EN_US','ES_ES','IT_IT') NOT NULL,
  `status`         ENUM('PENDING','PROCESSING','READY','FAILED') NOT NULL DEFAULT 'PENDING',
  `provider`       VARCHAR(80) NULL,
  `rawText`        LONGTEXT NOT NULL,
  `normalizedText` LONGTEXT NULL,
  `confidence`     DOUBLE NULL,
  `startedAt`      DATETIME(3) NULL,
  `completedAt`    DATETIME(3) NULL,
  `errorMessage`   TEXT NULL,
  `metadata`       JSON NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL,

  UNIQUE INDEX `transcripts_assetId_language_key` (`assetId`, `language`),
  INDEX `transcripts_status_language_idx` (`status`, `language`),
  INDEX `transcripts_assetId_status_idx` (`assetId`, `status`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `captions` (
  `id`           VARCHAR(191) NOT NULL,
  `assetId`      VARCHAR(191) NOT NULL,
  `transcriptId` VARCHAR(191) NULL,
  `language`     ENUM('PT_BR','EN_US','ES_ES','IT_IT') NOT NULL,
  `format`       ENUM('VTT','SRT','TXT') NOT NULL,
  `status`       ENUM('PENDING','PROCESSING','READY','FAILED') NOT NULL DEFAULT 'PENDING',
  `storageKey`   VARCHAR(500) NULL,
  `publicUrl`    VARCHAR(1000) NULL,
  `content`      LONGTEXT NULL,
  `generatedAt`  DATETIME(3) NULL,
  `errorMessage` TEXT NULL,
  `metadata`     JSON NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL,

  UNIQUE INDEX `captions_assetId_language_format_key` (`assetId`, `language`, `format`),
  INDEX `captions_assetId_status_idx` (`assetId`, `status`),
  INDEX `captions_language_status_idx` (`language`, `status`),
  INDEX `captions_transcriptId_idx` (`transcriptId`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `assets`
  ADD CONSTRAINT `assets_ownerId_fkey`
    FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `assets`
  ADD CONSTRAINT `assets_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `assets`
  ADD CONSTRAINT `assets_contentId_fkey`
    FOREIGN KEY (`contentId`) REFERENCES `contents`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `transcripts`
  ADD CONSTRAINT `transcripts_assetId_fkey`
    FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `captions`
  ADD CONSTRAINT `captions_assetId_fkey`
    FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `captions`
  ADD CONSTRAINT `captions_transcriptId_fkey`
    FOREIGN KEY (`transcriptId`) REFERENCES `transcripts`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
