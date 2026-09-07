-- AlterTable: youtubeUrl nullable (ARTICLE type may not have a YouTube URL)
ALTER TABLE `contents`
  MODIFY COLUMN `youtubeUrl` VARCHAR(500) NULL;
