// @vitest-environment node
import { CronService } from '../cron.service';

// Regressao FA1 (review-executed do item 004 do loop
// 09-06-corgly-saas-agenda-google-bloqueio-ocupado): `runRecurringBookings`
// checava a ocupacao do slot FORA da transacao. Depois que ST002/ST003
// removeram o UNIQUE em `sessions.availabilitySlotId`, o P2002 deixou de servir
// de backstop e duas execucoes concorrentes podiam criar duas sessoes vivas no
// mesmo slot. O re-check dentro da transacao, sob o `SELECT ... FOR UPDATE`, e
// o que fecha essa janela.

const prismaMocks = vi.hoisted(() => ({
  recurringPatternFindMany: vi.fn(),
  sessionFindFirst: vi.fn(),
  availabilitySlotFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recurringPattern: { findMany: prismaMocks.recurringPatternFindMany },
    session: { findFirst: prismaMocks.sessionFindFirst },
    availabilitySlot: { findFirst: prismaMocks.availabilitySlotFindFirst },
  },
}));

const emailMocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/services/email.service', () => ({ emailService: { send: emailMocks.send } }));

const creditMocks = vi.hoisted(() => ({ getBalance: vi.fn() }));
vi.mock('@/services/credit.service', () => ({ creditService: { getBalance: creditMocks.getBalance } }));

const txMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  sessionFindFirst: vi.fn(),
  sessionCreate: vi.fn(),
  consumeOrNullWithTx: vi.fn(),
}));

vi.mock('@/lib/credits/credit-consumption.service', () => ({
  runSerializableCreditTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $queryRaw: txMocks.queryRaw,
      $executeRaw: txMocks.executeRaw,
      session: { findFirst: txMocks.sessionFindFirst, create: txMocks.sessionCreate },
    }),
  creditConsumptionService: { consumeOrNullWithTx: txMocks.consumeOrNullWithTx },
}));

vi.mock('@/services/availability.service', () => ({
  SLOT_OCCUPYING_STATUSES: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function futureSlot() {
  const startAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
  return { id: 'slot-1', startAt, endAt: new Date(startAt.getTime() + 60 * 60 * 1000) };
}

describe('CronService.runRecurringBookings - re-check de ocupacao dentro da transacao', () => {
  let service: CronService;

  beforeEach(() => {
    service = new CronService();
    vi.clearAllMocks();

    const slot = futureSlot();
    prismaMocks.recurringPatternFindMany.mockResolvedValue([
      {
        id: 'pattern-1',
        studentId: 'student-1',
        dayOfWeek: slot.startAt.getUTCDay(),
        startTime: `${String(slot.startAt.getUTCHours()).padStart(2, '0')}:${String(slot.startAt.getUTCMinutes()).padStart(2, '0')}`,
        isActive: true,
        student: {
          id: 'student-1',
          email: 'aluno@example.com',
          preferredLanguage: 'PT_BR',
          maxFutureSessions: 10,
        },
      },
    ]);
    // Nenhuma sessao recorrente ja agendada para a semana alvo.
    prismaMocks.sessionFindFirst.mockResolvedValue(null);
    // Leitura FORA da transacao: o slot parece livre.
    prismaMocks.availabilitySlotFindFirst.mockResolvedValue(slot);
    creditMocks.getBalance.mockResolvedValue(5);
    emailMocks.send.mockResolvedValue(undefined);

    txMocks.queryRaw.mockResolvedValue([{ id: 'slot-1', version: 1 }]);
    txMocks.executeRaw.mockResolvedValue(1);
    txMocks.consumeOrNullWithTx.mockResolvedValue({ batchIds: ['batch-1'] });
    txMocks.sessionCreate.mockResolvedValue({ id: 'session-1' });
  });

  it('aborta a iteracao quando outra sessao viva ocupou o slot depois da leitura fora da transacao', async () => {
    // A leitura de fora ja esta stale: dentro da tx existe ocupante.
    txMocks.sessionFindFirst.mockResolvedValue({ id: 'session-concorrente' });

    const result = await service.runRecurringBookings();

    expect(txMocks.sessionFindFirst).toHaveBeenCalledTimes(1);
    expect(txMocks.sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ availabilitySlotId: 'slot-1' }),
      }),
    );
    expect(txMocks.sessionCreate).not.toHaveBeenCalled();
    expect(result.booked).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('cria a sessao quando o slot continua livre dentro da transacao', async () => {
    txMocks.sessionFindFirst.mockResolvedValue(null);

    const result = await service.runRecurringBookings();

    expect(txMocks.sessionFindFirst).toHaveBeenCalledTimes(1);
    expect(txMocks.sessionCreate).toHaveBeenCalledTimes(1);
    expect(result.booked).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('faz o re-check depois de tomar o lock do slot, nunca antes', async () => {
    const ordem: string[] = [];
    txMocks.queryRaw.mockImplementation(async () => {
      ordem.push('FOR_UPDATE');
      return [{ id: 'slot-1', version: 1 }];
    });
    txMocks.sessionFindFirst.mockImplementation(async () => {
      ordem.push('RECHECK');
      return null;
    });
    txMocks.sessionCreate.mockImplementation(async () => {
      ordem.push('CREATE');
      return { id: 'session-1' };
    });

    await service.runRecurringBookings();

    expect(ordem).toEqual(['FOR_UPDATE', 'RECHECK', 'CREATE']);
  });
});
