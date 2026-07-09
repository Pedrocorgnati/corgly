-- T-043: MFA TOTP obrigatorio para admin.

-- Colunas de MFA no usuario.
ALTER TABLE `users`
  ADD COLUMN `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `mfaEnabledAt` DATETIME(3) NULL;

-- Segredo TOTP (cifrado em repouso) + estado de enrollment por usuario.
CREATE TABLE `user_mfa` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `secretEnc` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `confirmedAt` DATETIME(3) NULL,
  `lastVerifiedAt` DATETIME(3) NULL,
  `lastUsedCounter` BIGINT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `user_mfa_userId_key`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Codigos de recuperacao de uso unico (apenas hash).
CREATE TABLE `mfa_recovery_codes` (
  `id` VARCHAR(191) NOT NULL,
  `mfaId` VARCHAR(191) NOT NULL,
  `codeHash` VARCHAR(191) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `mfa_recovery_codes_mfaId_idx`(`mfaId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_mfa`
  ADD CONSTRAINT `user_mfa_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mfa_recovery_codes`
  ADD CONSTRAINT `mfa_recovery_codes_mfaId_fkey`
  FOREIGN KEY (`mfaId`) REFERENCES `user_mfa`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
