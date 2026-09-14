// @vitest-environment node
import { CronService } from '../cron.service';

// Item 024, caminho de producao 2 de 3: a recorrencia semanal
// (`runRecurringBookings`) tambem reserva por conta propria, sem passar pelo
// `bookingIdempotencyService`. O `findFirst` que escolhe o slot filtra por
// `isBlocked: false` FORA da transacao, e a projecao do bloqueio de ocupacao
// externa roda em transacao separada da escrita do ledger — logo existe janela
// em que a ocupacao ja vale e o slot ainda parece livre. Sem a rechecagem sob o
// `SELECT ... FOR UPDATE`, o cron agenda por cima do horario que o professor ja
// ocupou no Google, e o aluno so descobre na hora da aula.

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

/** `true` quando o SQL recebido e o da rechecagem de ocupacao externa. */
function ehRechecagemExterna(strings: TemplateStringsArray): boolean {
  return [...strings].join(' ').includes('external_busy_intervals');
}

describe('CronService.runRecurringBookings - rechecagem de ocupacao externa (item 024)', () => {
  let service: CronService;
  let slot: ReturnType<typeof futureSlot>;

  beforeEach(() => {
    service = new CronService();
    vi.clearAllMocks();

    slot = futureSlot();
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
    prismaMocks.sessionFindFirst.mockResolvedValue(null);
    // Leitura FORA da transacao: `isBlocked: false`, o slot parece livre.
    prismaMocks.availabilitySlotFindFirst.mockResolvedValue(slot);
    creditMocks.getBalance.mockResolvedValue(5);
    emailMocks.send.mockResolvedValue(undefined);

    txMocks.executeRaw.mockResolvedValue(1);
    txMocks.sessionFindFirst.mockResolvedValue(null);
    txMocks.consumeOrNullWithTx.mockResolvedValue({ batchIds: ['batch-1'] });
    txMocks.sessionCreate.mockResolvedValue({ id: 'session-1' });
  });

  it('nao cria a sessao recorrente quando existe ocupacao externa vigente sobre o slot travado', async () => {
    txMocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
      ehRechecagemExterna(strings)
        ? [{ id: 'busy-1' }]
        : [{ id: slot.id, version: 1, startAt: slot.startAt, endAt: slot.endAt }],
    );

    const result = await service.runRecurringBookings();

    expect(txMocks.sessionCreate).not.toHaveBeenCalled();
    // Nem CAS de `version`, nem consumo de credito: a iteracao condenada nao
    // pode deixar efeito colateral nenhum.
    expect(txMocks.executeRaw).not.toHaveBeenCalled();
    expect(txMocks.consumeOrNullWithTx).not.toHaveBeenCalled();
    expect(result.booked).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('usa a janela da linha TRAVADA, nao a da leitura de fora da transacao', async () => {
    // O slot foi remarcado entre a leitura de fora e o `FOR UPDATE`: a linha
    // travada tem outra janela. A rechecagem tem que perguntar pela janela nova.
    const travado = {
      startAt: new Date(slot.startAt.getTime() + 60 * 60 * 1000),
      endAt: new Date(slot.endAt.getTime() + 60 * 60 * 1000),
    };
    const janelasConsultadas: Array<{ inicio: unknown; fim: unknown }> = [];

    txMocks.queryRaw.mockImplementation(
      async (strings: TemplateStringsArray, ...valores: unknown[]) => {
        if (ehRechecagemExterna(strings)) {
          // Ordem dos binds no helper: `startAt < endAt` e depois `endAt > startAt`.
          janelasConsultadas.push({ fim: valores[0], inicio: valores[1] });
          return [];
        }
        return [{ id: slot.id, version: 1, startAt: travado.startAt, endAt: travado.endAt }];
      },
    );

    const result = await service.runRecurringBookings();

    expect(janelasConsultadas).toHaveLength(1);
    expect(janelasConsultadas[0].inicio).toEqual(travado.startAt);
    expect(janelasConsultadas[0].fim).toEqual(travado.endAt);
    expect(result.booked).toBe(1);
  });

  it('agenda normalmente quando a unica ocupacao que cobria o slot foi revogada', async () => {
    // `revokedAt IS NULL` no predicado: linha revogada nao volta na consulta.
    txMocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
      ehRechecagemExterna(strings)
        ? []
        : [{ id: slot.id, version: 1, startAt: slot.startAt, endAt: slot.endAt }],
    );

    const result = await service.runRecurringBookings();

    expect(txMocks.sessionCreate).toHaveBeenCalledTimes(1);
    expect(result.booked).toBe(1);
    expect(result.failed).toBe(0);
  });
});
