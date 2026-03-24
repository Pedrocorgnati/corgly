-- Migration: module8_feedback_schema
-- Evolves the Feedback table to match module-8 spec:
--   - Renames skill-based score columns to session-quality dimensions
--   - Renames generalComment → comment (now nullable)
--   - Drops unused optional fields
--   - Adds adminId, privateNote, reviewed, reviewedAt

-- Step 1: Add new columns
ALTER TABLE `feedbacks`
  ADD COLUMN `clarityScore`      INTEGER      NOT NULL DEFAULT 0 AFTER `sessionId`,
  ADD COLUMN `didacticsScore`    INTEGER      NOT NULL DEFAULT 0 AFTER `clarityScore`,
  ADD COLUMN `punctualityScore`  INTEGER      NOT NULL DEFAULT 0 AFTER `didacticsScore`,
  ADD COLUMN `engagementScore`   INTEGER      NOT NULL DEFAULT 0 AFTER `punctualityScore`,
  ADD COLUMN `comment`           TEXT         NULL     AFTER `engagementScore`,
  ADD COLUMN `adminId`           VARCHAR(191) NULL     AFTER `comment`,
  ADD COLUMN `privateNote`       TEXT         NULL     AFTER `adminId`,
  ADD COLUMN `reviewed`          BOOLEAN      NOT NULL DEFAULT false AFTER `privateNote`,
  ADD COLUMN `reviewedAt`        DATETIME(3)  NULL     AFTER `reviewed`;

-- Step 2: Migrate data from old columns
UPDATE `feedbacks` SET
  `clarityScore`     = `listeningScore`,
  `didacticsScore`   = `speakingScore`,
  `punctualityScore` = `writingScore`,
  `engagementScore`  = `vocabularyScore`,
  `comment`          = `generalComment`;

-- Step 3: Drop old columns
ALTER TABLE `feedbacks`
  DROP COLUMN `listeningScore`,
  DROP COLUMN `speakingScore`,
  DROP COLUMN `writingScore`,
  DROP COLUMN `vocabularyScore`,
  DROP COLUMN `generalComment`,
  DROP COLUMN `strengths`,
  DROP COLUMN `improvements`,
  DROP COLUMN `topicsCovered`,
  DROP COLUMN `recommendations`;

-- Step 4: Add FK index for adminId (nullable — student submissions have no adminId)
ALTER TABLE `feedbacks`
  ADD INDEX `feedbacks_adminId_idx` (`adminId`);
