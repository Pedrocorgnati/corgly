// @vitest-environment node
import { CronService } from '../cron.service';
import { logger } from '@/lib/logger';

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

    // `$queryRaw` da transacao serve dois SELECTs distintos: o `FOR UPDATE` do
    // slot e a rechecagem de ocupacao externa (item 024). Discriminar pelo SQL
    // e o unico jeito de nao devolver a linha do slot como se fosse ocupacao.
    txMocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
      [...strings].join(' ').includes('external_busy_intervals')
        ? []
        : [{ id: 'slot-1', version: 1, startAt: slot.startAt, endAt: slot.endAt }],
    );
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
    const slot = futureSlot();
    txMocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      if ([...strings].join(' ').includes('external_busy_intervals')) {
        ordem.push('EXTERNAL');
        return [];
      }
      ordem.push('FOR_UPDATE');
      return [{ id: 'slot-1', version: 1, startAt: slot.startAt, endAt: slot.endAt }];
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

    // A rechecagem externa (item 024) entra depois do re-check de ocupante e
    // ainda antes do CAS/credito/create: nenhuma das duas pode rodar antes do
    // `FOR UPDATE`, senao le estado que outra transacao ainda pode mudar.
    expect(ordem).toEqual(['FOR_UPDATE', 'RECHECK', 'EXTERNAL', 'CREATE']);
  });

  // GAP-03, pendencia logger-erro-bruto do GAP-07: o logger serializa message e
  // stack de um terceiro argumento (src/lib/logger.ts), entao o detalhe do erro
  // nao pode chegar la. O contexto leva so nome e codigo.
  const MARCADOR = 'detalhe-interno-sintetico-gap07';

  function chamadasDoMetodo() {
    return vi
      .mocked(logger.error)
      .mock.calls.filter((c) => String(c[0]).startsWith('[CronService.runRecurringBookings]'));
  }

  function logSerializado() {
    return JSON.stringify(vi.mocked(logger.error).mock.calls, (_k, v) =>
      v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v,
    );
  }

  it('sem slot: a falha do e-mail vai ao log so com nome e codigo', async () => {
    prismaMocks.availabilitySlotFindFirst.mockResolvedValue(null);
    emailMocks.send.mockRejectedValue(new Error(MARCADOR));

    await service.runRecurringBookings();
    await vi.waitFor(() => expect(vi.mocked(logger.error)).toHaveBeenCalled());

    const chamadas = chamadasDoMetodo();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toHaveLength(2);
    expect(chamadas[0][1]).toEqual({
      action: 'email.send',
      patternId: 'pattern-1',
      errorName: 'Error',
      errorCode: 'unknown',
    });
    expect(logSerializado()).not.toContain(MARCADOR);
  });

  it('sem credito: a falha do e-mail vai ao log so com nome e codigo', async () => {
    creditMocks.getBalance.mockResolvedValue(0);
    emailMocks.send.mockRejectedValue(new Error(MARCADOR));

    await service.runRecurringBookings();
    await vi.waitFor(() => expect(vi.mocked(logger.error)).toHaveBeenCalled());

    const chamadas = chamadasDoMetodo();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toHaveLength(2);
    expect(chamadas[0][1]).toEqual({
      action: 'email.send',
      patternId: 'pattern-1',
      errorName: 'Error',
      errorCode: 'unknown',
    });
    expect(logSerializado()).not.toContain(MARCADOR);
  });

  it('erro dentro da transacao vai ao log so com nome e codigo', async () => {
    txMocks.sessionFindFirst.mockResolvedValue(null);
    txMocks.consumeOrNullWithTx.mockRejectedValue(new Error(MARCADOR));

    const result = await service.runRecurringBookings();

    expect(result).toEqual({ booked: 0, failed: 1 });
    const chamadas = chamadasDoMetodo();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toHaveLength(2);
    expect(chamadas[0][1]).toEqual({
      action: 'cron.recurring',
      patternId: 'pattern-1',
      errorName: 'Error',
      errorCode: 'unknown',
    });
    expect(logSerializado()).not.toContain(MARCADOR);
  });
});
