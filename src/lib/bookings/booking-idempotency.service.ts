import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import {
  creditConsumptionService,
  runSerializableCreditTransaction,
} from '@/lib/credits/credit-consumption.service';
import { SessionStatus } from '@/lib/constants/enums';
import { SLOT_OCCUPYING_STATUSES } from '@/services/availability.service';
import { emailService } from '@/services/email.service';
import { EmailType, SupportedLanguage } from '@/types/enums';
import { logger } from '@/lib/logger';
import type { BookSessionInput } from '@/schemas/session.schema';
import type { ReminderSentAt, SessionWithMeta } from '@/types/session.types';

const DEFAULT_LOCK_TTL_MS = 2 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface BookingAlternativeSlot {
  id: string;
  startAt: string;
  endAt: string;
}

export interface BookingResult {
  session: SessionWithMeta;
  idempotentReplay: boolean;
  lock: {
    key: string;
    expiresAt: string;
  };
  alternatives: BookingAlternativeSlot[];
}

interface IdempotencyRecord {
  attemptId: string;
  fingerprint: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  expiresAt: Date | string;
  resultJson?: Prisma.JsonValue | string | null;
}

export class BookingConflictError extends AppError {
  constructor(
    code: string,
    message: string,
    status: number,
    public readonly alternatives: BookingAlternativeSlot[] = [],
  ) {
    super(code, message, status);
  }
}

function sessionToMeta(s: {
  id: string;
  studentId: string;
  availabilitySlotId: string;
  startAt: Date;
  endAt: Date;
  status: string;
  creditBatchId: string | null;
  isRecurring: boolean;
  recurringPatternId: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  completedAt: Date | null;
  extendedBy: number | null;
  reminderSentAt: unknown;
  rescheduleRequestSlotId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SessionWithMeta {
  return {
    id: s.id,
    studentId: s.studentId,
    availabilitySlotId: s.availabilitySlotId,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    status: s.status as SessionWithMeta['status'],
    creditBatchId: s.creditBatchId,
    isRecurring: s.isRecurring,
    recurringPatternId: s.recurringPatternId,
    cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
    cancelledBy: s.cancelledBy as SessionWithMeta['cancelledBy'],
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    extendedBy: s.extendedBy,
    reminderSentAt: (s.reminderSentAt as ReminderSentAt | null) ?? null,
    rescheduleRequestSlotId: s.rescheduleRequestSlotId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function parseBookingResult(value: Prisma.JsonValue | string | null | undefined): BookingResult | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return JSON.parse(value) as BookingResult;
  }
  return value as unknown as BookingResult;
}

export class BookingIdempotencyService {
  private readonly lockTtlMs = Number(process.env.BOOKING_LOCK_TTL_MS ?? DEFAULT_LOCK_TTL_MS);
  private readonly idempotencyTtlMs = Number(
    process.env.BOOKING_IDEMPOTENCY_TTL_MS ?? DEFAULT_IDEMPOTENCY_TTL_MS,
  );

  async lockAndBook(
    studentId: string,
    data: BookSessionInput,
    idempotencyKey?: string | null,
  ): Promise<BookingResult> {
    await this.purgeExpired();

    const cleanKey = idempotencyKey?.trim() || null;
    const owner = cleanKey ? `${studentId}:${cleanKey}` : `${studentId}:${crypto.randomUUID()}`;
    const fingerprint = `${studentId}:${data.availabilitySlotId}`;
    const attemptId = crypto.randomUUID();

    if (cleanKey) {
      const cached = await this.findActiveIdempotencyRecord(owner);
      if (cached) {
        if (cached.fingerprint !== fingerprint) {
          throw new BookingConflictError('BOOKING_010', 'Chave idempotente reutilizada para outro slot.', 409);
        }
        const cachedResult = parseBookingResult(cached.resultJson);
        if (cached.status === 'COMPLETED' && cachedResult) {
          return { ...cachedResult, idempotentReplay: true };
        }
        if (cached.status === 'IN_PROGRESS') {
          throw new BookingConflictError('BOOKING_011', 'Reserva já em processamento para esta chave.', 409);
        }
      }

      await this.claimIdempotencyRecord(owner, studentId, fingerprint, attemptId);
      const claimed = await this.findActiveIdempotencyRecord(owner);
      if (!claimed || claimed.attemptId !== attemptId) {
        throw new BookingConflictError('BOOKING_011', 'Reserva já em processamento para esta chave.', 409);
      }
    }

    try {
      const result = await this.createBookingTransaction(studentId, data, owner);

      if (cleanKey) {
        await this.completeIdempotencyRecord(owner, attemptId, result);
      }

      return result;
    } catch (err) {
      if (cleanKey) {
        await this.failIdempotencyRecord(owner, attemptId);
      }
      throw err;
    }
  }

  private async purgeExpired(): Promise<void> {
    await prisma.$executeRaw`DELETE FROM booking_slot_locks WHERE expiresAt <= NOW(3)`;
    await prisma.$executeRaw`DELETE FROM booking_idempotency_records WHERE expiresAt <= NOW(3)`;
  }

  private async findActiveIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
    const rows = await prisma.$queryRaw<IdempotencyRecord[]>`
      SELECT attemptId, fingerprint, status, expiresAt, resultJson
      FROM booking_idempotency_records
      WHERE idempotencyKey = ${key} AND expiresAt > NOW(3)
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private async claimIdempotencyRecord(
    key: string,
    studentId: string,
    fingerprint: string,
    attemptId: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + this.idempotencyTtlMs);

    await prisma.$executeRaw`
      INSERT INTO booking_idempotency_records (
        idempotencyKey, studentId, fingerprint, attemptId, status, expiresAt, createdAt, updatedAt
      )
      VALUES (${key}, ${studentId}, ${fingerprint}, ${attemptId}, 'IN_PROGRESS', ${expiresAt}, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        fingerprint = IF(expiresAt <= NOW(3) OR status = 'FAILED', VALUES(fingerprint), fingerprint),
        attemptId = IF(expiresAt <= NOW(3) OR status = 'FAILED', VALUES(attemptId), attemptId),
        status = IF(expiresAt <= NOW(3) OR status = 'FAILED', VALUES(status), status),
        resultJson = IF(expiresAt <= NOW(3) OR status = 'FAILED', NULL, resultJson),
        expiresAt = IF(expiresAt <= NOW(3) OR status = 'FAILED', VALUES(expiresAt), expiresAt),
        updatedAt = NOW(3)
    `;
  }

  private async completeIdempotencyRecord(
    key: string,
    attemptId: string,
    result: BookingResult,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + this.idempotencyTtlMs);
    const resultJson = JSON.stringify(result);

    await prisma.$executeRaw`
      UPDATE booking_idempotency_records
      SET status = 'COMPLETED', resultJson = ${resultJson}, expiresAt = ${expiresAt}, updatedAt = NOW(3)
      WHERE idempotencyKey = ${key} AND attemptId = ${attemptId}
    `;
  }

  private async failIdempotencyRecord(key: string, attemptId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + this.idempotencyTtlMs);

    await prisma.$executeRaw`
      UPDATE booking_idempotency_records
      SET status = 'FAILED', expiresAt = ${expiresAt}, updatedAt = NOW(3)
      WHERE idempotencyKey = ${key} AND attemptId = ${attemptId}
    `;
  }

  private async createBookingTransaction(
    studentId: string,
    data: BookSessionInput,
    owner: string,
  ): Promise<BookingResult> {
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { maxFutureSessions: true, preferredLanguage: true, email: true },
    });
    if (!student) throw new AppError('BOOKING_001', 'Estudante não encontrado.', 404);

    const availableCredits = await this.getAvailableCreditBalance(studentId);
    if (availableCredits < 1) {
      throw new AppError('BOOKING_005', 'Créditos insuficientes.', 402);
    }

    const { session, alternatives, lockExpiresAt } = await runSerializableCreditTransaction(async (tx) => {
      const slots = await tx.$queryRaw<
        Array<{
          id: string;
          isBlocked: boolean | number;
          version: number;
          startAt: Date;
          endAt: Date;
        }>
      >`
        SELECT id, isBlocked, version, startAt, endAt
        FROM availability_slots
        WHERE id = ${data.availabilitySlotId}
        FOR UPDATE
      `;

      const slot = slots[0];
      if (!slot) {
        throw new BookingConflictError('BOOKING_002', 'Slot não encontrado.', 404);
      }

      const alternatives = await this.findAlternativeSlots(tx, slot.startAt, slot.id);

      if (slot.startAt <= new Date()) {
        throw new BookingConflictError('BOOKING_006', 'Não é possível agendar em um horário já passado.', 422, alternatives);
      }

      if (Boolean(slot.isBlocked)) {
        throw new BookingConflictError('BOOKING_003', 'Horário não disponível. Selecione outro.', 409, alternatives);
      }

      // `findFirst` + filtro de status: `availabilitySlotId` deixou de ser unico
      // quando o slot passou a ser devolvido no cancelamento (ver
      // SLOT_OCCUPYING_STATUSES). Sessao cancelada e historico, nao ocupacao.
      const existingSession = await tx.session.findFirst({
        where: {
          availabilitySlotId: data.availabilitySlotId,
          status: { in: [...SLOT_OCCUPYING_STATUSES] },
        },
        select: { id: true },
      });
      if (existingSession) {
        throw new BookingConflictError('BOOKING_003', 'Horário não disponível. Selecione outro.', 409, alternatives);
      }

      const lockExpiresAt = await this.acquireSlotLockWithTx(tx, slot.id, owner, alternatives);

      const futureSessions = await tx.session.count({
        where: {
          studentId,
          status: { in: [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS] },
          startAt: { gt: new Date() },
        },
      });
      if (futureSessions >= student.maxFutureSessions) {
        throw new AppError('BOOKING_004', 'Limite de aulas futuras atingido.', 422);
      }

      const cas = await tx.$executeRaw`
        UPDATE availability_slots
        SET version = version + 1
        WHERE id = ${data.availabilitySlotId} AND version = ${slot.version}
      `;
      if (cas === 0) {
        throw new BookingConflictError('BOOKING_003', 'Horário não disponível. Selecione outro.', 409, alternatives);
      }

      const creditBatchId = await creditConsumptionService.consumeOneOrNullWithTx(tx, studentId);
      if (!creditBatchId) {
        throw new AppError('BOOKING_005', 'Créditos insuficientes.', 402);
      }

      const session = await tx.session.create({
        data: {
          studentId,
          availabilitySlotId: data.availabilitySlotId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          status: SessionStatus.SCHEDULED,
          creditBatchId,
        },
      });

      return { session, alternatives, lockExpiresAt };
    });

    void emailService
      .send({
        to: student.email,
        type: EmailType.BOOKING_CONFIRMED,
        data: {
          sessionId: session.id,
          startAt: session.startAt.toISOString(),
          endAt: session.endAt.toISOString(),
        },
        locale: student.preferredLanguage as SupportedLanguage,
      })
      .catch((e) => logger.error('[BookingIdempotencyService.lockAndBook] email error', { action: 'email.send' }, e));

    return {
      session: sessionToMeta(session as Parameters<typeof sessionToMeta>[0]),
      idempotentReplay: false,
      lock: {
        key: owner,
        expiresAt: lockExpiresAt,
      },
      alternatives,
    };
  }

  private async getAvailableCreditBalance(studentId: string): Promise<number> {
    const result = await prisma.$queryRaw<Array<{ total: bigint | number | string }>>`
      SELECT COALESCE(SUM(totalCredits - usedCredits), 0) AS total
      FROM credit_batches
      WHERE userId = ${studentId}
        AND usedCredits < totalCredits
        AND (expiresAt > NOW() OR expiresAt IS NULL)
    `;

    return Number(result[0]?.total ?? 0);
  }

  private async acquireSlotLockWithTx(
    tx: Prisma.TransactionClient,
    slotId: string,
    owner: string,
    alternatives: BookingAlternativeSlot[],
  ): Promise<string> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.lockTtlMs);
    const locks = await tx.$queryRaw<Array<{ owner: string; expiresAt: Date | string }>>`
      SELECT owner, expiresAt
      FROM booking_slot_locks
      WHERE slotId = ${slotId}
      FOR UPDATE
    `;
    const current = locks[0];

    if (current && new Date(current.expiresAt).getTime() > now.getTime() && current.owner !== owner) {
      throw new BookingConflictError(
        'BOOKING_012',
        'Slot temporariamente reservado por outro aluno.',
        409,
        alternatives,
      );
    }

    await tx.$executeRaw`
      INSERT INTO booking_slot_locks (slotId, owner, expiresAt, createdAt, updatedAt)
      VALUES (${slotId}, ${owner}, ${expiresAt}, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE owner = VALUES(owner), expiresAt = VALUES(expiresAt), updatedAt = NOW(3)
    `;

    return expiresAt.toISOString();
  }

  private async findAlternativeSlots(
    tx: Prisma.TransactionClient,
    preferredStartAt: Date,
    excludedSlotId: string,
  ): Promise<BookingAlternativeSlot[]> {
    const rows = await tx.$queryRaw<Array<{ id: string; startAt: Date; endAt: Date }>>`
      SELECT s.id, s.startAt, s.endAt
      FROM availability_slots s
      WHERE s.id <> ${excludedSlotId}
        AND s.isBlocked = 0
        AND s.startAt > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM sessions sess
          WHERE sess.availabilitySlotId = s.id
            AND sess.status IN (${Prisma.join(SLOT_OCCUPYING_STATUSES.map((status) => Prisma.sql`${status}`))})
        )
      ORDER BY ABS(TIMESTAMPDIFF(SECOND, s.startAt, ${preferredStartAt})) ASC, s.startAt ASC
      LIMIT 3
    `;

    return rows.map((slot) => ({
      id: slot.id,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
    }));
  }
}

export const bookingIdempotencyService = new BookingIdempotencyService();
