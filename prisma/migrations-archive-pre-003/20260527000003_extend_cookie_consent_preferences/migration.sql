-- Extend cookie consent preferences with legal text versioning and immutable history
ALTER TABLE `cookie_consents`
  ADD COLUMN `consentVersion` VARCHAR(20) NOT NULL DEFAULT '1.0',
  ADD COLUMN `legalTextVersion` VARCHAR(20) NOT NULL DEFAULT '1.0',
  ADD COLUMN `source` ENUM('COOKIE_BANNER','ACCOUNT_SETTINGS','CHECKOUT','ADMIN','IMPORT') NOT NULL DEFAULT 'COOKIE_BANNER',
  ADD COLUMN `acceptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `lastPreferenceSetAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE UNIQUE INDEX `cookie_consents_sessionFingerprint_key` ON `cookie_consents`(`sessionFingerprint`);
CREATE INDEX `cookie_consents_consentVersion_idx` ON `cookie_consents`(`consentVersion`);

CREATE TABLE `cookie_consent_history` (
  `id`                 VARCHAR(191) NOT NULL,
  `consentId`          VARCHAR(191) NULL,
  `userId`             VARCHAR(191) NULL,
  `sessionFingerprint` VARCHAR(191) NULL,
  `essentialAccepted`  BOOLEAN NOT NULL DEFAULT true,
  `analyticsAccepted`  BOOLEAN NOT NULL DEFAULT false,
  `marketingAccepted`  BOOLEAN NOT NULL DEFAULT false,
  `consentVersion`     VARCHAR(20) NOT NULL,
  `legalTextVersion`   VARCHAR(20) NOT NULL,
  `source`             ENUM('COOKIE_BANNER','ACCOUNT_SETTINGS','CHECKOUT','ADMIN','IMPORT') NOT NULL,
  `changedAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `metadata`           JSON NULL,

  INDEX `cookie_consent_history_consentId_changedAt_idx` (`consentId`, `changedAt`),
  INDEX `cookie_consent_history_userId_changedAt_idx` (`userId`, `changedAt`),
  INDEX `cookie_consent_history_sessionFingerprint_changedAt_idx` (`sessionFingerprint`, `changedAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `cookie_consent_history`
  ADD CONSTRAINT `cookie_consent_history_consentId_fkey`
    FOREIGN KEY (`consentId`) REFERENCES `cookie_consents`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `cookie_consent_history`
  ADD CONSTRAINT `cookie_consent_history_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
