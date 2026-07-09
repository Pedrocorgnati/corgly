-- AddColumn: users.preferred_currency (nullable CurrencyCode enum, ADR-0006 §2)
-- Null significa "nao escolhida ainda"; resolveChargeCurrency usa locale/fallback nesse caso.
ALTER TABLE `users` ADD COLUMN `preferred_currency` ENUM('USD','BRL','EUR','USDC') NULL;
