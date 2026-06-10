-- Create FX rates domain for multi-currency previews and billing policy
CREATE TABLE `fx_rates` (
  `id`             VARCHAR(191) NOT NULL,
  `baseCurrency`   ENUM('USD','BRL','EUR','USDC') NOT NULL DEFAULT 'USD',
  `quoteCurrency`  ENUM('USD','BRL','EUR','USDC') NOT NULL,
  `rate`           DECIMAL(18, 8) NOT NULL,
  `source`         ENUM('MANUAL','STRIPE','OPEN_EXCHANGE_RATES','COINGECKO','SEED') NOT NULL,
  `roundingPolicy` ENUM('HALF_UP','HALF_EVEN','FLOOR','CEIL') NOT NULL DEFAULT 'HALF_UP',
  `validFrom`      DATETIME(3) NOT NULL,
  `validUntil`     DATETIME(3) NULL,
  `collectedAt`    DATETIME(3) NOT NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL,

  UNIQUE INDEX `fx_rates_baseCurrency_quoteCurrency_source_validFrom_key` (`baseCurrency`, `quoteCurrency`, `source`, `validFrom`),
  INDEX `fx_rates_baseCurrency_quoteCurrency_validFrom_validUntil_idx` (`baseCurrency`, `quoteCurrency`, `validFrom`, `validUntil`),
  INDEX `fx_rates_source_collectedAt_idx` (`source`, `collectedAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
