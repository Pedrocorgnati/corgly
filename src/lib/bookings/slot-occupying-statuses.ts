import { SessionStatus } from '@/lib/constants/enums';

/**
 * Status em que uma `Session` ainda OCUPA o `AvailabilitySlot`.
 *
 * Lista POSITIVA de proposito (fail-closed). So os dois cancelamentos
 * (`CANCELLED_BY_STUDENT`, `CANCELLED_BY_ADMIN`) devolvem o horario ao pool;
 * qualquer outro estado — inclusive um status novo que venha a ser adicionado ao
 * enum — mantem o slot ocupado ate alguem decidir o contrario explicitamente.
 * Uma lista negativa (`notIn: [cancelados]`) faria o oposto: status futuro
 * liberaria o slot em silencio e permitiria dupla reserva.
 *
 * Desde a remocao do `@unique` de `Session.availabilitySlotId`, esta constante e
 * a definicao operacional de "slot ocupado" em toda a base. O banco nao garante
 * mais no-maximo-uma-sessao-viva-por-slot; quem garante e esta lista somada a
 * transacao SERIALIZABLE com `SELECT ... FOR UPDATE` no slot e CAS em
 * `availability_slots.version` (ver `SessionService.create`).
 *
 * Mora fora de `availability.service.ts` desde o item 036: a agenda do aluno usa a
 * MESMA lista para reconhecer as proprias reservas, e o modulo do servico puxa o
 * Prisma, que nao pode entrar no grafo de uma Server Action importada em teste de
 * componente. O servico reexporta a constante para os importadores antigos.
 */
export const SLOT_OCCUPYING_STATUSES: readonly SessionStatus[] = [
  SessionStatus.SCHEDULED,
  SessionStatus.IN_PROGRESS,
  SessionStatus.COMPLETED,
  SessionStatus.NO_SHOW_STUDENT,
  SessionStatus.NO_SHOW_ADMIN,
  SessionStatus.INTERRUPTED,
  SessionStatus.RESCHEDULE_PENDING,
];
