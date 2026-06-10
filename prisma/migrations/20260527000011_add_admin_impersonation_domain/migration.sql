-- Create admin impersonation audit domain with active-session conflict guards.
CREATE TABLE `admin_impersonation_sessions` (
  `id`               VARCHAR(191) NOT NULL,
  `adminId`          VARCHAR(191) NOT NULL,
  `studentId`        VARCHAR(191) NOT NULL,
  `startedAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt`        DATETIME(3) NOT NULL,
  `endedAt`          DATETIME(3) NULL,
  `endedById`        VARCHAR(191) NULL,
  `endReason`        ENUM('ADMIN_ENDED','TTL_EXPIRED','STUDENT_PASSWORD_RESET','SECURITY_REVIEW','SYSTEM_REVOKED') NULL,
  `reason`           VARCHAR(500) NOT NULL,
  `ipAddress`        VARCHAR(45) NOT NULL,
  `userAgent`        VARCHAR(512) NOT NULL,
  `activeAdminKey`   VARCHAR(191) NULL,
  `activeStudentKey` VARCHAR(191) NULL,
  `metadata`         JSON NULL,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3) NOT NULL,

  UNIQUE INDEX `admin_impersonation_sessions_activeAdminKey_key` (`activeAdminKey`),
  UNIQUE INDEX `admin_impersonation_sessions_activeStudentKey_key` (`activeStudentKey`),
  INDEX `admin_impersonation_sessions_adminId_startedAt_idx` (`adminId`, `startedAt`),
  INDEX `admin_impersonation_sessions_studentId_startedAt_idx` (`studentId`, `startedAt`),
  INDEX `admin_impersonation_sessions_expiresAt_idx` (`expiresAt`),
  INDEX `admin_impersonation_sessions_endedAt_idx` (`endedAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `admin_impersonation_sessions`
  ADD CONSTRAINT `admin_impersonation_sessions_adminId_fkey`
    FOREIGN KEY (`adminId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `admin_impersonation_sessions_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `admin_impersonation_sessions_endedById_fkey`
    FOREIGN KEY (`endedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
