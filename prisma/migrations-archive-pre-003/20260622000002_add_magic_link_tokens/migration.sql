-- T-045: magic-link authentication (login sem senha).

-- Token de magic-link dedicado: suporta multiplos tokens pendentes, uso unico
-- (consumedAt) e anti-replay. Armazena apenas o hash SHA-256 do token bruto.
CREATE TABLE `magic_link_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `requesterIp` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `magic_link_tokens_tokenHash_key`(`tokenHash`),
  INDEX `magic_link_tokens_userId_idx`(`userId`),
  INDEX `magic_link_tokens_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FK para users com cascade (remover usuario limpa seus tokens pendentes).
ALTER TABLE `magic_link_tokens`
  ADD CONSTRAINT `magic_link_tokens_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
