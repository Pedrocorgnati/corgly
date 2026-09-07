-- Devolucao de slot cancelado a disponibilidade.
--
-- `sessions.availabilitySlotId` era UNIQUE (`sessions_availabilitySlotId_key`), o que
-- prendia cada AvailabilitySlot a primeira Session criada sobre ele: cancelar a aula
-- nao liberava o horario, porque nenhuma segunda linha podia existir para o mesmo slot.
-- O indice passa a ser NAO-UNICO; a garantia de "no maximo uma sessao viva por slot"
-- migra para a aplicacao (SLOT_OCCUPYING_STATUSES + transacao SERIALIZABLE com
-- SELECT ... FOR UPDATE no slot e CAS em availability_slots.version).
--
-- Ordem obrigatoria: o UNIQUE atual e o unico indice sobre a coluna e sustenta a FK
-- `sessions_availabilitySlotId_fkey`. Dropar antes de criar o substituto faz o MySQL
-- recusar com errno 150 ("needed in a foreign key constraint").

-- CreateIndex
CREATE INDEX `sessions_availabilitySlotId_idx` ON `sessions`(`availabilitySlotId`);

-- DropIndex
DROP INDEX `sessions_availabilitySlotId_key` ON `sessions`;
