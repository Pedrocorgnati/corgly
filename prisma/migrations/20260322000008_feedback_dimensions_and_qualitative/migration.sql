-- G1: Rename feedback score columns (clarity/didactics/punctuality/engagement → listening/speaking/writing/vocabulary)
-- G2: Add qualitative feedback fields per dimension + rename comment → overallFeedback

-- Step 1: Add new score columns
ALTER TABLE `feedbacks`
  ADD COLUMN `listeningScore`     INT NOT NULL DEFAULT 0,
  ADD COLUMN `speakingScore`      INT NOT NULL DEFAULT 0,
  ADD COLUMN `writingScore`       INT NOT NULL DEFAULT 0,
  ADD COLUMN `vocabularyScore`    INT NOT NULL DEFAULT 0;

-- Step 2: Migrate existing score data
UPDATE `feedbacks` SET
  `listeningScore`  = `clarityScore`,
  `speakingScore`   = `didacticsScore`,
  `writingScore`    = `punctualityScore`,
  `vocabularyScore` = `engagementScore`;

-- Step 3: Drop old score columns
ALTER TABLE `feedbacks`
  DROP COLUMN `clarityScore`,
  DROP COLUMN `didacticsScore`,
  DROP COLUMN `punctualityScore`,
  DROP COLUMN `engagementScore`;

-- Step 4: Rename comment → overallFeedback
ALTER TABLE `feedbacks`
  RENAME COLUMN `comment` TO `overallFeedback`;

-- Step 5: Add qualitative text fields per dimension
ALTER TABLE `feedbacks`
  ADD COLUMN `listeningFeedback`  LONGTEXT NULL,
  ADD COLUMN `speakingFeedback`   LONGTEXT NULL,
  ADD COLUMN `writingFeedback`    LONGTEXT NULL,
  ADD COLUMN `vocabularyFeedback` LONGTEXT NULL;
