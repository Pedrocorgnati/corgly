-- T-029: shared booking idempotency and slot TTL locks.

CREATE TABLE `booking_slot_locks` (
  `slotId` VARCHAR(191) NOT NULL,
  `owner` VARCHAR(255) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`slotId`),
  INDEX `IDX_booking_slot_locks_expiresAt` (`expiresAt`),
  CONSTRAINT `booking_slot_locks_slotId_fkey`
    FOREIGN KEY (`slotId`) REFERENCES `availability_slots` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `booking_idempotency_records` (
  `idempotencyKey` VARCHAR(255) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `fingerprint` VARCHAR(255) NOT NULL,
  `attemptId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `resultJson` JSON NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`idempotencyKey`),
  INDEX `IDX_booking_idempotency_student` (`studentId`),
  INDEX `IDX_booking_idempotency_expiresAt` (`expiresAt`),
  CONSTRAINT `booking_idempotency_records_studentId_fkey`
    FOREIGN KEY (`studentId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
