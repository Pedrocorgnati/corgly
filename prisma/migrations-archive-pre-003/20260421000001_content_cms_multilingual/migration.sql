-- AlterTable contents: add CMS fields
ALTER TABLE `contents`
  ADD COLUMN `status` ENUM('DRAFT','SCHEDULED','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `category` VARCHAR(80) NULL,
  ADD COLUMN `publishedAt` DATETIME(3) NULL,
  ADD COLUMN `authorId` VARCHAR(191) NULL;

CREATE INDEX `contents_status_publishedAt_idx` ON `contents`(`status`, `publishedAt`);

-- Backfill: legacy isPublished=1 -> status=PUBLISHED
UPDATE `contents` SET `status` = 'PUBLISHED' WHERE `isPublished` = 1;

-- CreateTable content_translations
CREATE TABLE `content_translations` (
  `id`         VARCHAR(191) NOT NULL,
  `contentId`  VARCHAR(191) NOT NULL,
  `locale`     ENUM('PT_BR','EN_US','ES_ES','IT_IT') NOT NULL,
  `title`      VARCHAR(191) NOT NULL,
  `slug`       VARCHAR(200) NOT NULL,
  `excerpt`    TEXT NULL,
  `body`       LONGTEXT NOT NULL,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`  DATETIME(3) NOT NULL,

  UNIQUE INDEX `content_translations_contentId_locale_key` (`contentId`, `locale`),
  UNIQUE INDEX `content_translations_locale_slug_key` (`locale`, `slug`),
  INDEX `content_translations_locale_idx` (`locale`),

  PRIMARY KEY (`id`),

  CONSTRAINT `content_translations_contentId_fkey`
    FOREIGN KEY (`contentId`) REFERENCES `contents`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
