-- Migration: module6_session_constraints
-- Adds constraints and fields required by módulo-6 (Calendário/Agendamento)

-- 1. Unique constraint: um slot por sessão (evita dupla reserva)
ALTER TABLE `sessions`
  ADD UNIQUE INDEX `sessions_availabilitySlotId_key` (`availabilitySlotId`);

-- 2. JSON field para idempotência dos cron reminders (24h + 1h)
ALTER TABLE `sessions`
  ADD COLUMN `reminderSentAt` JSON NULL AFTER `extendedBy`;

-- 3. Campo para proposta de reagendamento (fluxo RESCHEDULE_PENDING)
ALTER TABLE `sessions`
  ADD COLUMN `rescheduleRequestSlotId` VARCHAR(191) NULL AFTER `reminderSentAt`;
