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
          $queryRaw: vi
            .fn()
            // Primeira chamada: slot livre sob FOR UPDATE
            .mockResolvedValueOnce([
              { id: 'slot-1', isBlocked: 0, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
            ])
            // Segunda chamada: sem ocupação externa
            .mockResolvedValueOnce([])
            // Terceira chamada: credit batches para consumo
            .mockResolvedValueOnce([{ id: 'batch-1', totalCredits: 10, usedCredits: 5 }]),
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
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([
              { id: 'slot-1', isBlocked: 0, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'batch-1', totalCredits: 10, usedCredits: 5 }]),
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
          $queryRaw: vi
            .fn()
            .mockResolvedValueOnce([
              { id: 'slot-1', isBlocked: 0, version: 1, startAt: FUTURE_START, endAt: FUTURE_END },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'batch-1', totalCredits: 10, usedCredits: 5 }]),
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

    // ── rechecagem de ocupação externa ──
    it('deve falhar com SESSION_057 quando slot fica ocupado externamente entre leitura e reserva', async () => {
      const queryRaw = vi
        .fn()
        // Primeira leitura: slot livre sob FOR UPDATE.
        .mockResolvedValueOnce([
          {
            id: 'slot-1',
            isBlocked: 0,
            version: 1,
            startAt: FUTURE_START,
            endAt: FUTURE_END,
          },
        ])
        // Segunda leitura: ledger ganhou ocupacao antes da confirmacao.
        .mockResolvedValueOnce([
          {
            id: 'busy-1',
            externalEventId: 'google-event-123',
          },
        ]);

      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 5,
        preferredLanguage: 'PT_BR',
        email: 'student@test.com',
      });

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: queryRaw,
          session: {
            ...mockPrisma.session,
            findFirst: vi.fn().mockResolvedValue(null),
          },
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      await expect(service.create('student-1', { availabilitySlotId: 'slot-1' })).rejects.toMatchObject({
        code: 'SESSION_057',
        status: 409,
      });

      expect(queryRaw).toHaveBeenCalledTimes(2);
      expect(queryRaw.mock.calls[1][0].join('?')).toContain('revokedAt IS NULL');
    });

    it('deve permitir reserva quando ocupacao externa foi revogada', async () => {
      const newSession = makeSession();
      const queryRaw = vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'slot-1',
            isBlocked: 0,
            version: 1,
            startAt: FUTURE_START,
            endAt: FUTURE_END,
          },
        ])
        // A query filtra revokedAt IS NULL, portanto a ocupacao revogada nao retorna.
        .mockResolvedValueOnce([])
        // Credit batches para consumo
        .mockResolvedValueOnce([{ id: 'batch-1', totalCredits: 10, usedCredits: 5 }]);

      mockPrisma.user.findUnique.mockResolvedValue({
        maxFutureSessions: 5,
        preferredLanguage: 'PT_BR',
        email: 'student@test.com',
      });

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const tx = {
          ...mockPrisma,
          $queryRaw: queryRaw,
          session: {
            ...mockPrisma.session,
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn().mockResolvedValue(newSession),
          },
          $executeRaw: vi.fn().mockResolvedValue(1),
        };
        return cb(tx as unknown as typeof mockPrisma);
      });

      const session = await service.create('student-1', {
        availabilitySlotId: 'slot-1',
      });
      expect(session.status).toBe('SCHEDULED');
      expect(queryRaw.mock.calls[1][0].join('?')).toContain('revokedAt IS NULL');
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

  // ── reschedule / approveReschedule: rechecagem de ocupacao externa (item 024) ──
  //
  // Reagendar move a sessao para DENTRO de outro slot, exatamente como `create`.
  // A janela nao-atomica e a mesma: o ledger `external_busy_intervals` ja tem a
  // linha vigente e `availability_slots.isBlocked` ainda nao foi projetado,
  // porque a projecao roda em transacao separada. Sem a rechecagem sob o
  // `FOR UPDATE`, o aluno cai num horario que o professor ja ocupou no Google.
  describe('reagendamento e ocupacao externa', () => {
    const NEW_START = new Date('2026-03-26T14:00:00Z');
    const NEW_END = new Date('2026-03-26T14:50:00Z');

    /** Linha do slot de destino como o `SELECT ... FOR UPDATE` a devolve. */
    function slotDestinoTravado() {
      return [{ id: 'slot-2', isBlocked: 0, version: 7, startAt: NEW_START, endAt: NEW_END }];
    }

    /**
     * Monta o `tx` com `$queryRaw` roteando por SQL: o `FOR UPDATE` do slot de
     * destino devolve a linha travada, a rechecagem devolve `ocupacoes`.
     * Discriminar pelo SQL (e nao por ordem de chamada) mantem o teste valido
     * se outra leitura entrar na transacao.
     */
    function txComOcupacao(ocupacoes: Array<{ id: string }>) {
      const queryRaw = vi.fn(async (strings: TemplateStringsArray) =>
        [...strings].join(' ').includes('external_busy_intervals')
          ? ocupacoes
          : slotDestinoTravado(),
      );
      const executeRaw = vi.fn().mockResolvedValue(1);
      const sessionFindFirst = vi.fn().mockResolvedValue(null);
      const sessionUpdate = vi.fn().mockResolvedValue(
        makeSession({ availabilitySlotId: 'slot-2', startAt: NEW_START, endAt: NEW_END }),
      );

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          ...mockPrisma,
          $queryRaw: queryRaw,
          $executeRaw: executeRaw,
          session: { ...mockPrisma.session, findFirst: sessionFindFirst, update: sessionUpdate },
        }),
      );

      return { queryRaw, executeRaw, sessionFindFirst, sessionUpdate };
    }

    it('reschedule imediato falha com SESSION_057 quando ha ocupacao externa vigente no slot de destino', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(makeSession());
      const { executeRaw, sessionUpdate } = txComOcupacao([{ id: 'busy-1' }]);

      await expect(
        service.reschedule('session-1', 'student-1', 'STUDENT', {
          newAvailabilitySlotId: 'slot-2',
        }),
      ).rejects.toMatchObject({ code: 'SESSION_057', status: 409 });

      // A troca condenada nao pode deixar rastro: sem CAS de version e sem
      // update da sessao.
      expect(executeRaw).not.toHaveBeenCalled();
      expect(sessionUpdate).not.toHaveBeenCalled();
    });

    it('reschedule imediato prossegue quando a ocupacao que cobria o slot de destino foi revogada', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(makeSession());
      // `revokedAt IS NULL` no predicado: linha revogada nao volta na consulta.
      const { queryRaw, sessionUpdate } = txComOcupacao([]);

      const result = await service.reschedule('session-1', 'student-1', 'STUDENT', {
        newAvailabilitySlotId: 'slot-2',
      });

      expect(result.availabilitySlotId).toBe('slot-2');
      expect(sessionUpdate).toHaveBeenCalledTimes(1);
      const sqlRechecagem = queryRaw.mock.calls
        .map((call) => [...(call[0] as unknown as string[])].join(' '))
        .find((sql) => sql.includes('external_busy_intervals'));
      expect(sqlRechecagem).toContain('revokedAt IS NULL');
    });

    it('approveReschedule falha com SESSION_057 quando o horario foi ocupado enquanto o pedido esperava o admin', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(
        makeSession({ status: 'RESCHEDULE_PENDING', rescheduleRequestSlotId: 'slot-2' }),
      );
      const { executeRaw, sessionUpdate } = txComOcupacao([{ id: 'busy-1' }]);

      await expect(service.approveReschedule('session-1')).rejects.toMatchObject({
        code: 'SESSION_057',
        status: 409,
      });

      expect(executeRaw).not.toHaveBeenCalled();
      expect(sessionUpdate).not.toHaveBeenCalled();
    });

    it('approveReschedule aprova quando a ocupacao que cobria o slot de destino foi revogada', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(
        makeSession({ status: 'RESCHEDULE_PENDING', rescheduleRequestSlotId: 'slot-2' }),
      );
      // O e-mail de reagendamento e fire-and-forget: sem aluno, nao dispara.
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const { sessionUpdate } = txComOcupacao([]);

      const result = await service.approveReschedule('session-1');

      expect(result.availabilitySlotId).toBe('slot-2');
      expect(sessionUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
