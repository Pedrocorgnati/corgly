-- CreateTable
-- Admin audit trail (THREAT-MODEL T-013, module-9/TASK-6 ST007)
CREATE TABLE `audit_logs` (
    `id`           VARCHAR(191) NOT NULL,
    `adminId`      VARCHAR(191) NOT NULL,
    `action`       VARCHAR(191) NOT NULL,
    `resourceType` VARCHAR(191) NOT NULL,
    `resourceId`   VARCHAR(191) NOT NULL,
    `metadata`     JSON NULL,
    `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_adminId_createdAt_idx`(`adminId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
