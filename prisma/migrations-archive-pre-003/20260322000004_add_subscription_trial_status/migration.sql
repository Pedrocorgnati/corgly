-- AddValue
-- Adiciona TRIAL ao enum SubscriptionStatus (B-001 BILLING-REVIEW)
-- MySQL: ALTER TABLE modifica a coluna que usa o ENUM diretamente

ALTER TABLE `subscriptions`
  MODIFY `status` ENUM('ACTIVE', 'CANCELLED', 'PAST_DUE', 'PAUSED', 'TRIAL') NOT NULL DEFAULT 'ACTIVE';
