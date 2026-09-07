-- Create onboarding profile domain for granular onboarding progress and goals
CREATE TABLE `onboarding_profiles` (
  `id`                VARCHAR(191) NOT NULL,
  `userId`            VARCHAR(191) NOT NULL,
  `currentLevel`      ENUM('BEGINNER','ELEMENTARY','INTERMEDIATE','UPPER_INTERMEDIATE','ADVANCED','PROFICIENT') NOT NULL DEFAULT 'BEGINNER',
  `preferredLanguage` ENUM('PT_BR','EN_US','ES_ES','IT_IT') NOT NULL DEFAULT 'EN_US',
  `timezone`          VARCHAR(100) NOT NULL,
  `currentStep`       ENUM('WELCOME','PROFILE','GOALS','PREFERENCES','EQUIPMENT_CHECK','COMPLETED') NOT NULL DEFAULT 'WELCOME',
  `preferences`       JSON NULL,
  `notes`             TEXT NULL,
  `completedAt`       DATETIME(3) NULL,
  `skippedAt`         DATETIME(3) NULL,
  `createdAt`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`         DATETIME(3) NOT NULL,

  UNIQUE INDEX `onboarding_profiles_userId_key` (`userId`),
  INDEX `onboarding_profiles_currentStep_updatedAt_idx` (`currentStep`, `updatedAt`),
  INDEX `onboarding_profiles_preferredLanguage_idx` (`preferredLanguage`),
  INDEX `onboarding_profiles_timezone_idx` (`timezone`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `language_goals` (
  `id`          VARCHAR(191) NOT NULL,
  `profileId`   VARCHAR(191) NOT NULL,
  `type`        ENUM('CONVERSATION','BUSINESS','TRAVEL','EXAM_PREP','CULTURE','PRONUNCIATION','GRAMMAR','OTHER') NOT NULL,
  `label`       VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `priority`    INTEGER NOT NULL DEFAULT 0,
  `targetDate`  DATETIME(3) NULL,
  `metadata`    JSON NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3) NOT NULL,

  UNIQUE INDEX `language_goals_profileId_type_key` (`profileId`, `type`),
  INDEX `language_goals_profileId_priority_idx` (`profileId`, `priority`),
  INDEX `language_goals_type_idx` (`type`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `onboarding_profiles`
  ADD CONSTRAINT `onboarding_profiles_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `language_goals`
  ADD CONSTRAINT `language_goals_profileId_fkey`
    FOREIGN KEY (`profileId`) REFERENCES `onboarding_profiles`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
