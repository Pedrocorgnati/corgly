-- AlterTable: Add push channel fields to GoogleCalendarCredential (item 022)
ALTER TABLE `google_calendar_credentials` ADD COLUMN `syncToken` VARCHAR(512) NULL;
ALTER TABLE `google_calendar_credentials` ADD COLUMN `channelId` VARCHAR(255) NULL;
ALTER TABLE `google_calendar_credentials` ADD COLUMN `resourceId` VARCHAR(255) NULL;
ALTER TABLE `google_calendar_credentials` ADD COLUMN `channelExpiration` DATETIME(3) NULL;
ALTER TABLE `google_calendar_credentials` ADD COLUMN `channelTokenHash` CHAR(64) NULL;
ALTER TABLE `google_calendar_credentials` ADD COLUMN `lastMessageNumber` BIGINT NULL;
ALTER TABLE `google_calendar_credentials` ADD COLUMN `syncLeaseId` VARCHAR(36) NULL;
ALTER TABLE `google_calendar_credentials` ADD COLUMN `syncLeaseExpiresAt` DATETIME(3) NULL;
ALTER TABLE `google_calendar_credentials` ADD COLUMN `lastSyncAt` DATETIME(3) NULL;

-- CreateIndex: Unique constraint on channelId for push channel identification
CREATE UNIQUE INDEX `google_calendar_credentials_channelId_key` ON `google_calendar_credentials`(`channelId`);