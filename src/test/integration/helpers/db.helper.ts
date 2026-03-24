/**
 * @module test/integration/helpers/db.helper
 *
 * Factories de banco de dados para testes de integração.
 * Cria registros reais via Prisma — sem mocks.
 *
 * Padrão: cada factory gera dados únicos por timestamp para evitar conflitos.
 */

import bcrypt from 'bcryptjs'
import type { User, AvailabilitySlot, Session, CreditBatch } from '@prisma/client'
import { testPrisma } from '../setup'

// ── Senha padrão de teste (pré-hasheada para reutilização) ────────────────────

const DEFAULT_PASSWORD = 'Test@123456'
let _cachedHash: string | null = null

async function getPasswordHash(): Promise<string> {
  if (!_cachedHash) _cachedHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  return _cachedHash
}

export { DEFAULT_PASSWORD }

// ── User ──────────────────────────────────────────────────────────────────────

interface CreateUserOptions {
  role?: 'STUDENT' | 'ADMIN'
  emailConfirmed?: boolean
  email?: string
  name?: string
  tokenVersion?: number
  isFirstPurchase?: boolean
  stripeCustomerId?: string
}

export async function createTestUser(options: CreateUserOptions = {}): Promise<User> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return testPrisma.user.create({
    data: {
      email: options.email ?? `student-${suffix}@corgly.test`,
      name: options.name ?? 'Test Student',
      passwordHash: await getPasswordHash(),
      role: options.role ?? 'STUDENT',
      timezone: 'America/Sao_Paulo',
      country: 'BR',
      emailConfirmed: options.emailConfirmed ?? true,
      tokenVersion: options.tokenVersion ?? 0,
      isFirstPurchase: options.isFirstPurchase ?? false,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
      stripeCustomerId: options.stripeCustomerId,
    },
  })
}

export async function createTestAdmin(options: Omit<CreateUserOptions, 'role'> = {}): Promise<User> {
  return createTestUser({
    ...options,
    role: 'ADMIN',
    email: options.email ?? `admin-${Date.now()}@corgly.test`,
    name: options.name ?? 'Test Admin',
  })
}

// ── AvailabilitySlot ──────────────────────────────────────────────────────────

interface CreateSlotOptions {
  startAt?: Date
  isBlocked?: boolean
}

export async function createTestSlot(options: CreateSlotOptions = {}): Promise<AvailabilitySlot> {
  const start = options.startAt ?? getFutureDate(48)
  const end = new Date(start.getTime() + 50 * 60 * 1000) // +50 min
  return testPrisma.availabilitySlot.create({
    data: {
      startAt: start,
      endAt: end,
      isBlocked: options.isBlocked ?? false,
      version: 0,
    },
  })
}

// ── CreditBatch ───────────────────────────────────────────────────────────────

interface CreateCreditBatchOptions {
  userId: string
  type?: 'SINGLE' | 'PACK_5' | 'PACK_10' | 'MONTHLY' | 'PROMO' | 'MANUAL' | 'REFUND'
  totalCredits?: number
  usedCredits?: number
  expiresAt?: Date | null
}

export async function createTestCreditBatch(
  options: CreateCreditBatchOptions,
): Promise<CreditBatch> {
  return testPrisma.creditBatch.create({
    data: {
      userId: options.userId,
      type: options.type ?? 'PACK_5',
      totalCredits: options.totalCredits ?? 5,
      usedCredits: options.usedCredits ?? 0,
      expiresAt: options.expiresAt !== undefined ? options.expiresAt : getFutureDate(30 * 24),
    },
  })
}

// ── Session ───────────────────────────────────────────────────────────────────

interface CreateSessionOptions {
  studentId: string
  availabilitySlotId: string
  creditBatchId?: string
  status?: Session['status']
  isRecurring?: boolean
}

export async function createTestSession(options: CreateSessionOptions): Promise<Session> {
  const slot = await testPrisma.availabilitySlot.findUniqueOrThrow({
    where: { id: options.availabilitySlotId },
  })
  return testPrisma.session.create({
    data: {
      studentId: options.studentId,
      availabilitySlotId: options.availabilitySlotId,
      startAt: slot.startAt,
      endAt: slot.endAt,
      status: options.status ?? 'SCHEDULED',
      creditBatchId: options.creditBatchId,
      isRecurring: options.isRecurring ?? false,
    },
  })
}

// ── Utils ─────────────────────────────────────────────────────────────────────

/** Retorna uma data N horas no futuro */
export function getFutureDate(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

/** Retorna uma data N horas no passado */
export function getPastDate(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}
