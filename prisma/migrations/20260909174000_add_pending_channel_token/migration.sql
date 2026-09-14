-- AlterTable: guarda o token cifrado somente enquanto a criacao do canal esta pendente.
ALTER TABLE `google_calendar_credentials` ADD COLUMN `channelTokenEnc` TEXT NULL;
