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

interface CreateSessionOptions extends Partial<Omit<Session, 'scheduledAt'>> {
  scheduledAt?: Date | string;
  status?: Session['status'];
}

export function createSession(overrides?: CreateSessionOptions): Session & { endAt: Date } {
  const now = new Date();
  const startAt = overrides?.scheduledAt
    ? new Date(overrides.scheduledAt as string)
    : addHours(now, 24);
  const endAt = addMinutes(startAt, 60);

  if (endAt <= startAt) {
    throw new Error('startAt must be before endAt');
  }

  const sessionNow = now.toISOString();
  const defaults: Session & { endAt: Date } = {
    id: genId(),
    studentId: genId(),
    student: undefined,
    scheduledAt: startAt.toISOString(),
    endAt,
    durationMinutes: 60,
    status: SessionStatus.SCHEDULED,
    creditBatchId: undefined,
    documentId: undefined,
    feedbackId: undefined,
    rtcState: undefined,
    createdAt: sessionNow,
    updatedAt: sessionNow,
  };

  const { scheduledAt: _, ...rest } = overrides ?? {};
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
