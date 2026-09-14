// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookingConflictError,
  BookingIdempotencyService,
  type BookingResult,
} from '../booking-idempotency.service';
import { creditConsumptionService } from '@/lib/credits/credit-consumption.service';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  session: {
    findUnique: vi.fn(),
    // `findFirst` desde a devolucao de slot cancelado: a checagem de ocupacao
    // passou a filtrar por SLOT_OCCUPYING_STATUSES em vez de casar o unique.
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

const NOW = new Date('2026-06-17T12:00:00Z');
const START = new Date('2026-06-20T14:00:00Z');
const END = new Date('2026-06-20T14:50:00Z');

function session() {
  return {
    id: 'session-1',
    studentId: 'student-1',
    availabilitySlotId: 'slot-1',
    startAt: START,
    endAt: END,
    status: 'SCHEDULED' as const,
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
  };
}

function bookingResult(): BookingResult {
  return {
    session: {
      ...session(),
      startAt: START.toISOString(),
      endAt: END.toISOString(),
      cancelledAt: null,
      completedAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
    idempotentReplay: false,
    lock: {
      key: 'student-1:key-12345678',
      expiresAt: new Date(NOW.getTime() + 120_000).toISOString(),
    },
    alternatives: [],
  };
}

/**
 * Junta o SQL de todas as chamadas de `$executeRaw` num texto unico. Existe
 * porque o servico dispara duas limpezas de registros expirados FORA da
 * transacao: contar chamadas nao distingue "nao mutou o slot" de "nao rodou".
 */
function executeRawSql(): string {
  return mockPrisma.$executeRaw.mock.calls
    .map((call) => (Array.isArray(call[0]) ? [...(call[0] as string[])].join(' ') : String(call[0])))
    .join('\n');
}

describe('BookingIdempotencyService', () => {
  let service: BookingIdempotencyService;

  beforeEach(() => {
    service = new BookingIdempotencyService();
    vi.useFakeTimers({ now: NOW });
    vi.clearAllMocks();
    mockPrisma.$executeRaw.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays a completed idempotent booking without opening a new transaction', async () => {
    const cached = bookingResult();
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        attemptId: 'attempt-1',
        fingerprint: 'student-1:slot-1',
        status: 'COMPLETED',
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        resultJson: cached,
      },
    ]);

    const result = await service.lockAndBook(
      'student-1',
      { availabilitySlotId: 'slot-1' },
      'key-12345678',
    );

    expect(result.idempotentReplay).toBe(true);
    expect(result.session.id).toBe('session-1');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps an active slot lock until its TTL and returns actionable alternatives', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      maxFutureSessions: 5,
      preferredLanguage: 'PT_BR',
      email: 'student@test.com',
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
      const txQueryRaw = vi
        .fn()
        .mockResolvedValueOnce([
          { id: 'slot-1', isBlocked: 0, version: 1, startAt: START, endAt: END },
        ])
        .mockResolvedValueOnce([
          { id: 'slot-2', startAt: new Date('2026-06-20T15:00:00Z'), endAt: new Date('2026-06-20T15:50:00Z') },
        ])
        // Rechecagem de ocupacao externa: sem intervalo vigente cobrindo o slot.
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            owner: 'student-2:key-87654321',
            expiresAt: new Date(NOW.getTime() + 60_000),
          },
        ]);
      return cb({ ...mockPrisma, $queryRaw: txQueryRaw } as unknown as typeof mockPrisma);
    });

    await expect(
      service.lockAndBook('student-1', { availabilitySlotId: 'slot-1' }, null),
    ).rejects.toMatchObject({
      code: 'BOOKING_012',
      alternatives: [
        {
          id: 'slot-2',
          startAt: '2026-06-20T15:00:00.000Z',
          endAt: '2026-06-20T15:50:00.000Z',
        },
      ],
    } satisfies Partial<BookingConflictError>);
  });

  it('blocks students without credits before opening the slot lock transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      maxFutureSessions: 5,
      preferredLanguage: 'PT_BR',
      email: 'student@test.com',
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);

    await expect(
      service.lockAndBook('student-1', { availabilitySlotId: 'slot-1' }, null),
    ).rejects.toMatchObject({
      code: 'BOOKING_005',
      status: 402,
      message: 'Créditos insuficientes.',
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  // Item 024: o horario fica ocupado no Google DEPOIS do aluno abrir a tela e
  // ANTES da confirmacao. O ledger `external_busy_intervals` ja tem a linha
  // vigente; `availability_slots.isBlocked` ainda nao foi projetado, porque a
  // projecao roda em transacao separada. Sem a rechecagem, esta reserva passa.
  it('rejects the booking with SESSION_057 when an active external interval covers the locked slot', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      maxFutureSessions: 5,
      preferredLanguage: 'PT_BR',
      email: 'student@test.com',
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);

    const consumeSpy = vi.spyOn(creditConsumptionService, 'consumeOneOrNullWithTx');

    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
      const txQueryRaw = vi
        .fn()
        // slot travado com FOR UPDATE: isBlocked ainda 0 (projecao pendente)
        .mockResolvedValueOnce([
          { id: 'slot-1', isBlocked: 0, version: 1, startAt: START, endAt: END },
        ])
        // alternativas
        .mockResolvedValueOnce([
          { id: 'slot-2', startAt: new Date('2026-06-20T15:00:00Z'), endAt: new Date('2026-06-20T15:50:00Z') },
        ])
        // rechecagem de ocupacao externa: intervalo vigente cobre a janela
        .mockResolvedValueOnce([{ id: 'busy-1' }]);
      return cb({ ...mockPrisma, $queryRaw: txQueryRaw } as unknown as typeof mockPrisma);
    });

    await expect(
      service.lockAndBook('student-1', { availabilitySlotId: 'slot-1' }, null),
    ).rejects.toMatchObject({
      code: 'SESSION_057',
      status: 409,
      message: 'Horário indisponível por ocupação externa.',
      alternatives: [
        {
          id: 'slot-2',
          startAt: '2026-06-20T15:00:00.000Z',
          endAt: '2026-06-20T15:50:00.000Z',
        },
      ],
    } satisfies Partial<BookingConflictError>);

    // A reserva condenada nao pode deixar rastro: sem lock, sem CAS de version,
    // sem consumo de credito e sem sessao criada. (`$executeRaw` ainda recebe
    // as duas limpezas de expirados que rodam FORA da transacao, entao a
    // asercao e por SQL, nao por contagem de chamadas.)
    expect(executeRawSql()).not.toContain('UPDATE availability_slots');
    expect(executeRawSql()).not.toContain('INSERT INTO booking_slot_locks');
    expect(mockPrisma.session.findFirst).not.toHaveBeenCalled();
    expect(consumeSpy).not.toHaveBeenCalled();
    expect(mockPrisma.session.create).not.toHaveBeenCalled();
  });

  // Espelho do teste acima: ocupacao REVOGADA (`revokedAt` preenchido) nao e
  // devolvida pelo predicado, entao a reserva segue normalmente. Sem este
  // caso a rechecagem poderia ser implementada larga demais e travar horario
  // que o professor liberou no Google.
  it('books normally when the only external interval covering the slot is revoked', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      maxFutureSessions: 5,
      preferredLanguage: 'PT_BR',
      email: 'student@test.com',
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);
    mockPrisma.session.findFirst.mockResolvedValue(null);
    mockPrisma.session.count.mockResolvedValue(0);
    mockPrisma.session.create.mockResolvedValue(session());

    const consumeSpy = vi
      .spyOn(creditConsumptionService, 'consumeOneOrNullWithTx')
      .mockResolvedValue('batch-1');

    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
      const txQueryRaw = vi
        .fn()
        .mockResolvedValueOnce([
          { id: 'slot-1', isBlocked: 0, version: 1, startAt: START, endAt: END },
        ])
        .mockResolvedValueOnce([])
        // rechecagem: a unica linha que cobre a janela esta revogada, e o
        // `revokedAt IS NULL` do predicado a exclui — retorno vazio.
        .mockResolvedValueOnce([])
        // nenhum lock vigente no slot
        .mockResolvedValueOnce([]);
      return cb({ ...mockPrisma, $queryRaw: txQueryRaw } as unknown as typeof mockPrisma);
    });

    const result = await service.lockAndBook(
      'student-1',
      { availabilitySlotId: 'slot-1' },
      null,
    );

    expect(result.session.id).toBe('session-1');
    expect(consumeSpy).toHaveBeenCalledTimes(1);
    expect(mockPrisma.session.create).toHaveBeenCalledTimes(1);
  });
});
