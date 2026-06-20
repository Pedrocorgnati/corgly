// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookingConflictError,
  BookingIdempotencyService,
  type BookingResult,
} from '../booking-idempotency.service';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  session: {
    findUnique: vi.fn(),
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
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 1n }]);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
      const txQueryRaw = vi
        .fn()
        .mockResolvedValueOnce([
          { id: 'slot-1', isBlocked: 0, version: 1, startAt: START, endAt: END },
        ])
        .mockResolvedValueOnce([
          { id: 'slot-2', startAt: new Date('2026-06-20T15:00:00Z'), endAt: new Date('2026-06-20T15:50:00Z') },
        ])
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
      alternatives: [{ id: 'slot-2' }],
    } satisfies Partial<BookingConflictError>);
  });

  it('blocks students without credits before opening the slot lock transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      maxFutureSessions: 5,
      preferredLanguage: 'PT_BR',
      email: 'student@test.com',
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 0n }]);

    await expect(
      service.lockAndBook('student-1', { availabilitySlotId: 'slot-1' }, null),
    ).rejects.toMatchObject({
      code: 'BOOKING_005',
      status: 402,
      message: 'Créditos insuficientes.',
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
