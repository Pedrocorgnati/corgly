-- T-031: local idempotency records for subscription updates and admin refunds.

CREATE TABLE `billing_idempotency_records` (
  `idempotencyKey` VARCHAR(255) NOT NULL,
  `scope` VARCHAR(64) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `fingerprint` VARCHAR(64) NOT NULL,
  `attemptId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `resultJson` JSON NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`idempotencyKey`),
  INDEX `IDX_billing_idempotency_scope_owner` (`scope`, `ownerId`),
  INDEX `IDX_billing_idempotency_expiresAt` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
