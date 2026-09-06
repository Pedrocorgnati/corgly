/**
 * @module test/factories
 * Factories de teste — Module 2: Shared Foundations
 *
 * Uso: `createUser()`, `createSession({ status: 'IN_PROGRESS' })`, `createCreditBatch()`
 */

import type { User, Session, Credit } from '@/lib/types';
import { UserRole, SessionStatus, CreditType, CreditStatus } from '@/types/enums';

// ── UUID util ─────────────────────────────────────────────────────────────────

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para ambientes sem crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ── Date util ────────────────────────────────────────────────────────────────

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ── createUser ───────────────────────────────────────────────────────────────

export function createUser(overrides?: Partial<User>): User {
  const now = new Date().toISOString();
  const defaults: User = {
    id: genId(),
    name: 'Test User',
    email: `test-${genId().slice(0, 8)}@example.com`,
    role: UserRole.STUDENT,
    timezone: 'America/Sao_Paulo',
    country: 'BR',
    avatarUrl: undefined,
    creditBalance: 0,
    stripeCustomerId: undefined,
    isFirstPurchase: true,
    streakCount: 0,
    lastSessionAt: undefined,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  };

  return { ...defaults, ...overrides };
}

// ── createSession ────────────────────────────────────────────────────────────
//
// Espelha `SessionWithMeta` (src/types/session.types.ts), o unico shape que a
// API emite via `sessionToMeta`. Datas sao ISO string, nao Date: o shape legado
// (`scheduledAt`, `durationMinutes`, `student`, `documentId`, `feedbackId`,
// `rtcState`) nao existe mais.

/** Overrides aceitam Date por conveniencia de teste; a factory normaliza para ISO. */
export interface CreateSessionOptions
  extends Partial<Omit<Session, 'startAt' | 'endAt'>> {
  startAt?: Date | string;
  endAt?: Date | string;
}

export function createSession(overrides?: CreateSessionOptions): Session {
  const { startAt: startOverride, endAt: endOverride, ...rest } = overrides ?? {};

  const now = new Date();
  const startAt = startOverride ? new Date(startOverride) : addHours(now, 24);
  const endAt = endOverride ? new Date(endOverride) : addMinutes(startAt, 60);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error('startAt/endAt precisam ser datas validas');
  }
  if (endAt <= startAt) {
    throw new Error('startAt must be before endAt');
  }

  const sessionNow = now.toISOString();
  const defaults: Session = {
    id: genId(),
    studentId: genId(),
    availabilitySlotId: genId(),
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    status: SessionStatus.SCHEDULED,
    creditBatchId: null,
    isRecurring: false,
    recurringPatternId: null,
    cancelledAt: null,
    cancelledBy: null,
    completedAt: null,
    extendedBy: null,
    reminderSentAt: null,
    rescheduleRequestSlotId: null,
    createdAt: sessionNow,
    updatedAt: sessionNow,
  };

  return { ...defaults, ...rest };
}

// ── createCreditBatch ────────────────────────────────────────────────────────

export function createCreditBatch(overrides?: Partial<Credit>): Credit {
  const now = new Date();
  const defaults: Credit = {
    id: genId(),
    studentId: genId(),
    type: CreditType.PACK_5,
    status: CreditStatus.ACTIVE,
    quantity: 5,
    usedQuantity: 0,
    expiresAt: addMonths(now, 3).toISOString(),
    stripePaymentIntentId: undefined,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return { ...defaults, ...overrides };
}
