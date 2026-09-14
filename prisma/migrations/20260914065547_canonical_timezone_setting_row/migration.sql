-- GAP-07 (item 018, H03 do plano): linha do fuso canonico da agenda.
-- Idempotente: reaplicar nao duplica e nunca sobrescreve valor ja gravado.
INSERT INTO `app_settings` (`key`, `value`, `updatedAt`)
VALUES ('timezone', 'America/Sao_Paulo', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `key` = `key`;
