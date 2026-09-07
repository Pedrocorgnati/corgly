-- T-035: student refund request intake.

CREATE TABLE `refund_requests` (
  `id` VARCHAR(191) NOT NULL,
  `paymentId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `refund_requests_paymentId_userId_key`(`paymentId`, `userId`),
  INDEX `refund_requests_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `refund_requests`
  ADD CONSTRAINT `refund_requests_paymentId_fkey`
  FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `refund_requests`
  ADD CONSTRAINT `refund_requests_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
