/**
 * session.types.ts — Contratos cross-module para módulo 6 (Calendário/Agendamento)
 *
 * Usado por: SessionService, CronService, AvailabilityService e pela fronteira
 * API/UI (src/actions/dashboard.ts) via reexport em '@/lib/types'.
 *
 * FONTE ÚNICA DE VERDADE do shape de sessão. Qualquer mudança aqui tem que
 * andar junto com o serializador `sessionToMeta` (src/services/session.service.ts).
 * Não importar Prisma types diretamente para manter contratos estáveis.
 */

import type { SessionStatus, UserRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// Contrato de consumo de créditos (módulo-5 CreditService)
// ---------------------------------------------------------------------------
export interface CreditServiceContract {
  consume(
    userId: string,
    qty: number,
  ): Promise<{ consumed: number; batchIds: string[] } | null>;
  refund(userId: string, qty: number, creditBatchId?: string): Promise<void>;
  getBalance(userId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Contexto de lock otimista em slot (CAS — Compare And Swap)
// ---------------------------------------------------------------------------
export interface SlotLockContext {
  slotId: string;
  expectedVersion: number;
}

// ---------------------------------------------------------------------------
// Sessão com metadados calculados — resposta da API
//
// É EXATAMENTE isto que GET /api/v1/sessions devolve dentro de `data[]`.
// O horário de início é `startAt` (ISO): não existe `scheduledAt`, e a duração
// se calcula com `endAt - startAt` — não existe `durationMinutes`.
// ---------------------------------------------------------------------------
export interface SessionWithMeta {
  id: string;
  studentId: string;
  availabilitySlotId: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: SessionStatus;
  creditBatchId: string | null;
  isRecurring: boolean;
  recurringPatternId: string | null;
  cancelledAt: string | null;
  cancelledBy: UserRole | null;
  completedAt: string | null;
  extendedBy: number | null;
  reminderSentAt: ReminderSentAt | null;
  rescheduleRequestSlotId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderSentAt {
  '24h'?: string; // ISO datetime quando o reminder de 24h foi enviado
  '1h'?: string; // ISO datetime quando o reminder de 1h foi enviado
}

// ---------------------------------------------------------------------------
// Input de criação de sessão (usado pelo SessionService.create)
// ---------------------------------------------------------------------------
export interface CreateSessionInput {
  availabilitySlotId: string;
}

// ---------------------------------------------------------------------------
// Input de cancelamento (usado pelo SessionService.cancel)
// ---------------------------------------------------------------------------
export interface CancelSessionInput {
  reason?: string;
}

// ---------------------------------------------------------------------------
// Input de remarcação (usado pelo SessionService.reschedule)
// ---------------------------------------------------------------------------
export interface RescheduleSessionInput {
  newAvailabilitySlotId: string;
}

// ---------------------------------------------------------------------------
// Resultado do bulk cancel (admin)
// ---------------------------------------------------------------------------
export interface BulkCancelResult {
  cancelled: number;
  refunded: number;
  blocked: number;
  errors: Array<{ sessionId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Previa do bulk cancel (admin) — contagem sem efeito, mesmos predicados da
// execucao. Consumida por `GET /api/v1/sessions/bulk-cancel` e pelo
// BulkBlockModal antes de liberar o botao destrutivo.
// ---------------------------------------------------------------------------
export interface BulkCancelPreview {
  sessionsToCancel: number;
  slotsToBlock: number;
}

// ---------------------------------------------------------------------------
// Parâmetros de listagem (SessionService.listAll / listByStudent)
// ---------------------------------------------------------------------------
export interface ListSessionsParams {
  page?: number;
  limit?: number;
  status?: SessionStatus;
  from?: string; // ISO date
  to?: string; // ISO date
}

export interface PaginatedSessions {
  data: SessionWithMeta[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
