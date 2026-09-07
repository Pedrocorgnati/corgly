// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionService } from '../session.service';
import { SLOT_OCCUPYING_STATUSES } from '../availability.service';
import { AppError } from '@/lib/errors';

// ── Mocks ──
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  availabilitySlot: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));

const mockCreditService = vi.hoisted(() => ({
  consume: vi.fn().mockResolvedValue({ batchIds: ['batch-1'] }),
  refund: vi.fn().mockResolvedValue(undefined),
  getBalance: vi.fn().mockResolvedValue(5),
}));
vi.mock('@/services/credit.service', () => ({
  creditService: mockCreditService,
}));

// ── Helpers ──
const NOW = new Date('2026-03-21T12:00:00Z');
const FUTURE_START = new Date('2026-03-25T14:00:00Z');
const FUTURE_END = new Date('2026-03-25T14:50:00Z');

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    studentId: 'student-1',
    availabilitySlotId: 'slot-1',
    startAt: FUTURE_START,
    endAt: FUTURE_END,
    status: 'SCHEDULED',
    creditBatchId: 'batch-1',
    isRecurring: false,
    recurringPatternId: null,
    cancelledAt: null,
    cancelledBy: null,
    completedAt: null,
    extendedBy: null,
    reminderSentAt: null,
    rescheduleRequestSlotId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW });
    // Default: $transaction resolves arrays (used by listByStudent/listAll)
    mockPrisma.$transaction.mockImplementation(
      (arrOrFn: unknown) =>
        typeof arrOrFn === 'function'
          ? (arrOrFn as (tx: unknown) => unknown)(mockPrisma)
          : Promise.all(arrOrFn as Promise<unknown>[]),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── create ──
  describe('create', () => {
    it('should create a session (happy path)', async () => {
      const newSession = makeSession();

      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 5,
        preferredLanguage: 'PT_BR',
        email: 'student@test.com',
      });

      // $transaction executes the callback
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'slot-1', isBlocked: 0, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
          ]),
          session: {
            ...mockPrisma.session,
            findUnique: vi.fn().mockResolvedValue(null),
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(newSession),
          },
          $executeRaw: vi.fn().mockResolvedValue(1),
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      const result = await service.create('student-1', { availabilitySlotId: 'slot-1' });
      expect(result.id).toBe('session-1');
      expect(result.status).toBe('SCHEDULED');
    });

    it('consulta o slot por findFirst filtrando SLOT_OCCUPYING_STATUSES', async () => {
      const newSession = makeSession();
      const findFirst = vi.fn().mockResolvedValue(null);

      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 5,
        preferredLanguage: 'PT_BR',
        email: 'student@test.com',
      });

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'slot-1', isBlocked: 0, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
          ]),
          session: {
            ...mockPrisma.session,
            findFirst,
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(newSession),
          },
          $executeRaw: vi.fn().mockResolvedValue(1),
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      await service.create('student-1', { availabilitySlotId: 'slot-1' });

      // Forma da query, nao so o resultado: `findUnique` por availabilitySlotId
      // deixou de existir e o filtro de status e o que devolve o slot cancelado.
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          availabilitySlotId: 'slot-1',
          status: { in: [...SLOT_OCCUPYING_STATUSES] },
        },
        select: { id: true },
      });
    });

    it('sessao cancelada no slot nao bloqueia nova reserva', async () => {
      const newSession = makeSession({ id: 'session-2', studentId: 'student-2' });
      // O filtro de status roda no banco: com apenas historico cancelado no slot,
      // o findFirst nao encontra ocupante e a criacao segue.
      const findFirst = vi.fn().mockResolvedValue(null);

      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 5,
        preferredLanguage: 'PT_BR',
        email: 'student2@test.com',
      });

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'slot-1', isBlocked: 0, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
          ]),
          session: {
            ...mockPrisma.session,
            findFirst,
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(newSession),
          },
          $executeRaw: vi.fn().mockResolvedValue(1),
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      const result = await service.create('student-2', { availabilitySlotId: 'slot-1' });
      expect(result.id).toBe('session-2');
      expect(findFirst.mock.calls[0][0].where.status.in).not.toContain('CANCELLED_BY_STUDENT');
      expect(findFirst.mock.calls[0][0].where.status.in).not.toContain('CANCELLED_BY_ADMIN');
    });

    it('should throw SESSION_001 when student not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create('nonexistent', { availabilitySlotId: 'slot-1' }),
      ).rejects.toThrow(AppError);

      try {
        await service.create('nonexistent', { availabilitySlotId: 'slot-1' });
      } catch (err) {
        expect((err as AppError).message).toContain('Estudante');
      }
    });

    it('should throw SESSION_002 when slot not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 5,
        preferredLanguage: 'PT_BR',
        email: 'test@test.com',
      });
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: vi.fn().mockResolvedValue([]), // No slot
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      await expect(
        service.create('student-1', { availabilitySlotId: 'missing' }),
      ).rejects.toThrow(AppError);
    });

    it('should throw SESSION_003 when slot is blocked', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 5,
        preferredLanguage: 'PT_BR',
        email: 'test@test.com',
      });
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'slot-1', isBlocked: 1, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
          ]),
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      await expect(
        service.create('student-1', { availabilitySlotId: 'slot-1' }),
      ).rejects.toThrow(AppError);
    });

    it('should throw SESSION_004 when max future sessions reached', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 2,
        preferredLanguage: 'PT_BR',
        email: 'test@test.com',
      });
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'slot-1', isBlocked: 0, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
          ]),
          session: {
            ...mockPrisma.session,
            findUnique: vi.fn().mockResolvedValue(null),
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(2), // At max
          },
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      await expect(
        service.create('student-1', { availabilitySlotId: 'slot-1' }),
      ).rejects.toThrow(AppError);
    });

    it('should throw SESSION_003 on CAS version mismatch (race condition)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 5,
        preferredLanguage: 'PT_BR',
        email: 'test@test.com',
      });
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: vi.fn().mockResolvedValue([
            { id: 'slot-1', isBlocked: 0, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
          ]),
          session: {
            ...mockPrisma.session,
            findUnique: vi.fn().mockResolvedValue(null),
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
          },
          $executeRaw: vi.fn().mockResolvedValue(0), // CAS failed
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      await expect(
        service.create('student-1', { availabilitySlotId: 'slot-1' }),
      ).rejects.toThrow(AppError);
    });
  });

  // ── cancel ──
  describe('cancel', () => {
    it('should cancel with refund when >= 12h before session', async () => {
      const session = makeSession({ startAt: new Date(NOW.getTime() + 13 * 60 * 60 * 1000) });
      mockPrisma.session.findUnique.mockResolvedValue({
        ...session,
        student: { email: 'test@test.com', preferredLanguage: 'PT_BR' },
      });
      mockPrisma.session.update.mockResolvedValue({
        ...session,
        status: 'CANCELLED_BY_STUDENT',
        cancelledAt: NOW,
        cancelledBy: 'STUDENT',
      });

      const result = await service.cancel('session-1', 'student-1', 'STUDENT', {});

      expect(result.status).toBe('CANCELLED_BY_STUDENT');
      expect(mockCreditService.refund).toHaveBeenCalled();
    });

    it('should cancel without refund when < 12h before session (late cancellation)', async () => {
      const session = makeSession({ startAt: new Date(NOW.getTime() + 6 * 60 * 60 * 1000) });
      mockPrisma.session.findUnique.mockResolvedValue({
        ...session,
        student: { email: 'test@test.com', preferredLanguage: 'PT_BR' },
      });
      mockPrisma.session.update.mockResolvedValue({
        ...session,
        status: 'CANCELLED_BY_STUDENT',
        cancelledAt: NOW,
        cancelledBy: 'STUDENT',
      });

      const result = await service.cancel('session-1', 'student-1', 'STUDENT', {});

      expect(result.status).toBe('CANCELLED_BY_STUDENT');
      expect(mockCreditService.refund).not.toHaveBeenCalled();
    });

    it('should always refund when cancelled by admin', async () => {
      const session = makeSession({ startAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000) });
      mockPrisma.session.findUnique.mockResolvedValue({
        ...session,
        student: { email: 'test@test.com', preferredLanguage: 'PT_BR' },
      });
      mockPrisma.session.update.mockResolvedValue({
        ...session,
        status: 'CANCELLED_BY_ADMIN',
        cancelledAt: NOW,
        cancelledBy: 'ADMIN',
      });

      const result = await service.cancel('session-1', 'admin-1', 'ADMIN', {});

      expect(result.status).toBe('CANCELLED_BY_ADMIN');
      expect(mockCreditService.refund).toHaveBeenCalled();
    });

    it('should throw SESSION_010 when session not found', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(
        service.cancel('missing', 'student-1', 'STUDENT', {}),
      ).rejects.toThrow(AppError);
    });
  });

  // ── listByStudent ──
  describe('listByStudent', () => {
    it('should return paginated sessions', async () => {
      mockPrisma.session.findMany.mockResolvedValue([makeSession()]);
      mockPrisma.session.count.mockResolvedValue(1);

      const result = await service.listByStudent('student-1', { page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ── listAll ──
  describe('listAll', () => {
    it('should return paginated sessions for admin', async () => {
      mockPrisma.session.findMany.mockResolvedValue([makeSession()]);
      mockPrisma.session.count.mockResolvedValue(1);

      const result = await service.listAll({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ── autoConfirm ──
  describe('autoConfirm', () => {
    it('should mark expired sessions as COMPLETED', async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.autoConfirm();
      expect(result.confirmed).toBe(3);
    });
  });
});
