// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingIdempotencyService } from '../booking-idempotency.service';
import { creditConsumptionService } from '@/lib/credits/credit-consumption.service';

// GAP-13: `BOOKING_IDEMPOTENCY_TTL_MS` e `BOOKING_LOCK_TTL_MS` definidas mas
// vazias, zero, negativas ou nao numericas precisam cair no default. Com
// `Number(env ?? default)` o `??` so cobre `undefined`/`null`: `''` vira TTL 0,
// o registro de idempotencia nasce expirado e toda reserva com chave recebe
// 409 BOOKING_011; o lock do slot nasce vencido e a exclusao mutua some.

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  session: {
    findUnique: vi.fn(),
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

const DEFAULT_IDEMPOTENCY_TTL_MS = 86_400_000;
const DEFAULT_LOCK_TTL_MS = 120_000;

type TtlEnvName = 'BOOKING_IDEMPOTENCY_TTL_MS' | 'BOOKING_LOCK_TTL_MS';

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

function resetPrismaMocks(): void {
  mockPrisma.user.findUnique.mockReset();
  mockPrisma.session.findFirst.mockReset();
  mockPrisma.session.count.mockReset();
  mockPrisma.session.create.mockReset();
  mockPrisma.$executeRaw.mockReset();
  mockPrisma.$queryRaw.mockReset();
  mockPrisma.$transaction.mockReset();
  mockPrisma.$executeRaw.mockResolvedValue(1);
  mockPrisma.$queryRaw.mockResolvedValue([]);
}

/**
 * Relogio falso e env ANTES do construtor: os TTLs sao lidos nos
 * inicializadores de campo da classe, entao o stub precisa existir quando o
 * `new` roda.
 */
function buildService(env: Partial<Record<TtlEnvName, string>>): BookingIdempotencyService {
  vi.useFakeTimers({ now: NOW });
  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value);
  }
  return new BookingIdempotencyService();
}

/** SQL de uma chamada de `$executeRaw` (tagged template) como texto unico. */
function sqlOf(call: unknown[]): string {
  const strings = call[0];
  return Array.isArray(strings) ? [...(strings as string[])].join(' ') : String(strings);
}

/**
 * Caminho com chave idempotente: o primeiro `$queryRaw` (registro ativo) volta
 * vazio e o servico grava o claim. Devolve o `expiresAt` interpolado no INSERT
 * de `booking_idempotency_records` (quinto valor do template, `call[5]`). O
 * desfecho da reserva nao importa aqui.
 */
async function idempotencyExpiresAtMs(service: BookingIdempotencyService): Promise<number> {
  mockPrisma.$queryRaw.mockResolvedValueOnce([]);

  await service
    .lockAndBook('student-1', { availabilitySlotId: 'slot-1' }, 'key-12345678')
    .catch(() => undefined);

  const insert = mockPrisma.$executeRaw.mock.calls.find((call) =>
    sqlOf(call).includes('INSERT INTO booking_idempotency_records'),
  );
  const expiresAt = insert?.[5];
  expect(expiresAt).toBeInstanceOf(Date);
  return (expiresAt as Date).getTime();
}

/**
 * Caminho feliz sem chave (mesmos mocks de transacao do teste existente):
 * devolve o `lock.expiresAt` do resultado em ms.
 */
async function lockExpiresAtMs(service: BookingIdempotencyService): Promise<number> {
  mockPrisma.user.findUnique.mockResolvedValue({
    maxFutureSessions: 5,
    preferredLanguage: 'PT_BR',
    email: 'student@test.com',
  });
  mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);
  mockPrisma.session.findFirst.mockResolvedValue(null);
  mockPrisma.session.count.mockResolvedValue(0);
  mockPrisma.session.create.mockResolvedValue(session());
  vi.spyOn(creditConsumptionService, 'consumeOneOrNullWithTx').mockResolvedValue('batch-1');

  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
    const txQueryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'slot-1', isBlocked: 0, version: 1, startAt: START, endAt: END },
      ])
      // alternativas
      .mockResolvedValueOnce([])
      // rechecagem de ocupacao externa: nenhum intervalo vigente
      .mockResolvedValueOnce([])
      // nenhum lock vigente no slot
      .mockResolvedValueOnce([]);
    return cb({ ...mockPrisma, $queryRaw: txQueryRaw } as unknown as typeof mockPrisma);
  });

  const result = await service.lockAndBook('student-1', { availabilitySlotId: 'slot-1' }, null);
  return new Date(result.lock.expiresAt).getTime();
}

const INVALID_VALUES: Array<{ label: string; raw: string }> = [
  { label: 'zero', raw: '0' },
  { label: 'negativo', raw: '-5' },
  { label: 'nao-numerico', raw: 'abc' },
  { label: 'espacos', raw: '   ' },
];

describe('BookingIdempotencyService - TTL com env vazio ou invalido (GAP-13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPrismaMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("R1 BOOKING_IDEMPOTENCY_TTL_MS='' cai no default de 24h no claim de idempotencia", async () => {
    const service = buildService({ BOOKING_IDEMPOTENCY_TTL_MS: '' });

    expect(await idempotencyExpiresAtMs(service)).toBe(NOW.getTime() + DEFAULT_IDEMPOTENCY_TTL_MS);
  });

  it("R2 BOOKING_LOCK_TTL_MS='' cai no default de 2min no lock do slot", async () => {
    const service = buildService({ BOOKING_LOCK_TTL_MS: '' });

    expect(await lockExpiresAtMs(service)).toBe(NOW.getTime() + DEFAULT_LOCK_TTL_MS);
  });

  for (const { label, raw } of INVALID_VALUES) {
    it(`R3-idem-${label} BOOKING_IDEMPOTENCY_TTL_MS='${raw}' cai no default de 24h`, async () => {
      const service = buildService({ BOOKING_IDEMPOTENCY_TTL_MS: raw });

      expect(await idempotencyExpiresAtMs(service)).toBe(NOW.getTime() + DEFAULT_IDEMPOTENCY_TTL_MS);
    });

    it(`R3-lock-${label} BOOKING_LOCK_TTL_MS='${raw}' cai no default de 2min`, async () => {
      const service = buildService({ BOOKING_LOCK_TTL_MS: raw });

      expect(await lockExpiresAtMs(service)).toBe(NOW.getTime() + DEFAULT_LOCK_TTL_MS);
    });
  }

  it("C1 controle: '5000' nas duas variaveis continua configuravel nos dois caminhos", async () => {
    const service = buildService({
      BOOKING_IDEMPOTENCY_TTL_MS: '5000',
      BOOKING_LOCK_TTL_MS: '5000',
    });

    expect(await idempotencyExpiresAtMs(service)).toBe(NOW.getTime() + 5000);

    resetPrismaMocks();
    expect(await lockExpiresAtMs(service)).toBe(NOW.getTime() + 5000);
  });
});
