// @vitest-environment node
/**
 * GAP-07 (item 018) - a recorrencia do cron le o fuso canonico persistido.
 *
 * `runRecurringBookings` converte o "HH:mm" do padrao com `localTimeToUtc` e o
 * fuso de `getCanonicalTimezone()`. Este arquivo trava essa leitura sem editar
 * `cron.service.ts` (fora do escopo da GAP-07): o fuso vem de
 * `appSetting.findUnique`, pelo modulo real de `@/lib/canonical-timezone`.
 *
 * Conta: relogio 2026-09-14T15:00Z (segunda) -> semana alvo comeca em
 * 2026-09-21T15:00Z; `dayOfWeek: 2` cai em 2026-09-22. 09:00 em Europe/Lisbon
 * (WEST, UTC+1) = 08:00Z; em Europe/Rome (CEST, UTC+2) = 07:00Z. A janela de
 * busca do slot e de 5 minutos para cada lado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CronService } from '../cron.service';

const prismaMocks = vi.hoisted(() => ({
  recurringPatternFindMany: vi.fn(),
  sessionFindFirst: vi.fn(),
  availabilitySlotFindFirst: vi.fn(),
  appSettingFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recurringPattern: { findMany: prismaMocks.recurringPatternFindMany },
    session: { findFirst: prismaMocks.sessionFindFirst },
    availabilitySlot: { findFirst: prismaMocks.availabilitySlotFindFirst },
    appSetting: { findUnique: prismaMocks.appSettingFindUnique },
  },
}));

const emailMocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/services/email.service', () => ({ emailService: { send: emailMocks.send } }));

const creditMocks = vi.hoisted(() => ({ getBalance: vi.fn() }));
vi.mock('@/services/credit.service', () => ({ creditService: { getBalance: creditMocks.getBalance } }));

vi.mock('@/lib/credits/credit-consumption.service', () => ({
  runSerializableCreditTransaction: vi.fn(),
  creditConsumptionService: { consumeOrNullWithTx: vi.fn() },
}));

vi.mock('@/services/availability.service', () => ({
  SLOT_OCCUPYING_STATUSES: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const PADRAO = {
  id: 'pattern-1',
  studentId: 'student-1',
  dayOfWeek: 2,
  startTime: '09:00',
  isActive: true,
  student: {
    id: 'student-1',
    email: 'aluno@example.com',
    preferredLanguage: 'PT_BR',
    maxFutureSessions: 10,
  },
};

describe('CronService.runRecurringBookings - fuso canonico (GAP-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-14T15:00:00.000Z'));
    prismaMocks.recurringPatternFindMany.mockResolvedValue([PADRAO]);
    // Nenhuma sessao recorrente na semana alvo e nenhum slot livre na janela:
    // o padrao termina em `failed`, depois de a busca do slot registrar a janela.
    prismaMocks.sessionFindFirst.mockResolvedValue(null);
    prismaMocks.availabilitySlotFindFirst.mockResolvedValue(null);
    prismaMocks.appSettingFindUnique.mockResolvedValue({ key: 'timezone', value: 'Europe/Lisbon' });
    emailMocks.send.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('REGRESSAO 018: recorrencia usa o fuso canonico persistido', async () => {
    const result = await new CronService().runRecurringBookings();

    expect(prismaMocks.appSettingFindUnique).toHaveBeenCalledWith({ where: { key: 'timezone' } });
    expect(prismaMocks.availabilitySlotFindFirst).toHaveBeenCalledTimes(1);
    const where = prismaMocks.availabilitySlotFindFirst.mock.calls[0][0].where;
    expect(where.startAt.gte).toEqual(new Date('2026-09-22T07:55:00.000Z'));
    expect(where.startAt.lte).toEqual(new Date('2026-09-22T08:05:00.000Z'));
    expect(where.isBlocked).toBe(false);
    expect(result).toEqual({ booked: 0, failed: 1 });
  });

  it('CONTROLE: Europe/Rome desloca a janela', async () => {
    prismaMocks.appSettingFindUnique.mockResolvedValue({ key: 'timezone', value: 'Europe/Rome' });

    await new CronService().runRecurringBookings();

    const where = prismaMocks.availabilitySlotFindFirst.mock.calls[0][0].where;
    expect(where.startAt.gte).toEqual(new Date('2026-09-22T06:55:00.000Z'));
    expect(where.startAt.lte).toEqual(new Date('2026-09-22T07:05:00.000Z'));
  });
});
