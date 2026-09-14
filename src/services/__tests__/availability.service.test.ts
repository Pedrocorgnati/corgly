// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AvailabilityService, SLOT_OCCUPYING_STATUSES } from '../availability.service';
import { AppError } from '@/lib/errors';

// ── Mocks ──
const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  availabilitySlot: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  // Ledger de ocupacao externa (item 016): `generateSlots` o consulta antes do
  // createMany. Entra no mock por model, como os demais; sem ele, os seis
  // testes preexistentes de generateSlots quebram com `undefined is not a
  // function` no primeiro await.
  externalBusyInterval: {
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// ── Helpers ──
const NOW = new Date('2026-03-21T12:00:00Z');

function makeSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slot-1',
    startAt: new Date('2026-03-22T14:00:00Z'),
    endAt: new Date('2026-03-22T14:50:00Z'),
    isBlocked: false,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * Arma `prisma.$transaction` para entregar um `tx` com as tres primitivas que
 * `blockSlot`/`unblockSlot` usam apos o item 012: `$queryRaw` (SELECT ... FOR UPDATE),
 * `session.findFirst` (re-check de ocupante sob o lock) e `$executeRaw` (CAS).
 * A linha crua devolve `isBlocked` como numero (tinyint do MySQL), como em
 * `session.service.ts` no `reschedule`.
 */
function armarTx(options: {
  row?: { id: string; isBlocked: number; version: number; blockOrigin?: string | null } | null;
  occupant?: { id: string } | null;
  cas?: number;
}) {
  const { row = { id: 'slot-1', isBlocked: 0, version: 3 }, occupant = null, cas = 1 } = options;
  // Origem derivada de `isBlocked` quando a fixture nao a declara, espelhando o default de
  // `createTestSlot`: linha bloqueada sem origem e o estado que a migration do item 015
  // eliminou do banco, entao nenhuma fixture pode arma-lo por omissao.
  const linha =
    row === null
      ? null
      : {
          ...row,
          blockOrigin: row.blockOrigin !== undefined ? row.blockOrigin : row.isBlocked ? 'MANUAL' : null,
        };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(linha ? [linha] : []),
    $executeRaw: vi.fn().mockResolvedValue(cas),
    session: { findFirst: vi.fn().mockResolvedValue(occupant) },
  };
  mockPrisma.$transaction.mockImplementation(
    (fn: (client: typeof tx) => unknown) => Promise.resolve(fn(tx)),
  );
  return tx;
}

/**
 * Arma `prisma.$transaction` para REJEITAR com um erro de contencao do driver, o
 * desfecho que nao passa por nenhum guard: quem perde a corrida fica esperando no
 * `FOR UPDATE` e sai por timeout da transacao interativa (`P2028`), deadlock
 * (`P2034`) ou errno cru do InnoDB (`1205`/`1213`) embrulhado em `P2010`.
 */
function armarTxContencao(err: unknown) {
  mockPrisma.$transaction.mockImplementation(() => Promise.reject(err));
}

function erroPrisma(code: string, message: string, meta?: Record<string, unknown>) {
  const err = new Error(message) as Error & { code: string; meta?: Record<string, unknown> };
  err.code = code;
  if (meta) err.meta = meta;
  return err;
}

/**
 * Erro no formato cru do `mysql2`, que expoe `errno` numerico e `code`
 * simbolico. Chega assim quando o driver sobe sem o embrulho `P2010`.
 */
function erroDriver(errno: number, code: string, message: string) {
  const err = new Error(message) as Error & { code: string; errno: number };
  err.code = code;
  err.errno = errno;
  return err;
}

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  beforeEach(() => {
    service = new AvailabilityService();
    vi.clearAllMocks();
    // Ledger vazio por default: a unica coisa que os casos preexistentes de
    // generateSlots podem observar e a ausencia de consulta (caso travado em
    // 'nao consulta o ledger quando nao ha slot novo').
    mockPrisma.externalBusyInterval.findMany.mockResolvedValue([]);
  });

  // ── getAvailable ──
  describe('getAvailable', () => {
    /**
     * Congela so o `Date`: o piso de `getAvailable` depende do relogio (item 033) e
     * os mocks do Prisma resolvem por microtask, que segue real.
     */
    function congelarRelogio(instante: string) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(instante));
    }

    beforeEach(() => {
      // Relogio ANTES das janelas dos casos preexistentes: o piso deles continua
      // sendo o inicio do dia pedido, como quando foram escritos.
      congelarRelogio('2026-02-20T12:00:00.000Z');
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should query exactly the window received and return non-blocked slots without sessions', async () => {
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot()]);

      const result = await service.getAvailable('2026-03-01', '2026-04-01');

      // A janela consultada e exatamente a recebida: nenhuma constante de sete
      // dias sobrevive dentro do servico.
      const [args] = mockPrisma.availabilitySlot.findMany.mock.calls[0];
      expect(args.where.startAt.gte).toEqual(new Date('2026-03-01T00:00:00.000Z'));
      expect(args.where.startAt.gt).toBeUndefined();
      expect(args.where.startAt.lt).toEqual(new Date('2026-04-01T00:00:00.000Z'));
      expect(args.where.isBlocked).toBe(false);
      expect(args.where.sessions).toEqual({
        none: { status: { in: [...SLOT_OCCUPYING_STATUSES] } },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('slot-1');
      expect(result[0].isBlocked).toBe(false);
    });

    it('filtra por SLOT_OCCUPYING_STATUSES em vez de sessions:{none:{}}', async () => {
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot()]);

      await service.getAvailable('2026-03-01', '2026-04-01');

      // Forma da query: um slot com apenas sessoes canceladas precisa voltar ao
      // pool, entao o `none` passa a ser condicionado ao status ocupante.
      const args = mockPrisma.availabilitySlot.findMany.mock.calls[0][0];
      expect(args.where.sessions).toEqual({
        none: { status: { in: [...SLOT_OCCUPYING_STATUSES] } },
      });
      expect(args.where.sessions.none.status.in).not.toContain('CANCELLED_BY_STUDENT');
      expect(args.where.sessions.none.status.in).not.toContain('CANCELLED_BY_ADMIN');
    });

    it('should return empty array when no slots in range', async () => {
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([]);

      const result = await service.getAvailable('2026-05-01', '2026-06-01');
      expect(result).toEqual([]);
    });

    // Item 036 - trava de regressao da ocultacao para o aluno. O mock do Prisma nao
    // aplica `where` sozinho: o `findMany` abaixo filtra as linhas pelo `where`
    // recebido, como o banco faria, entao a exclusao so acontece se a consulta
    // carregar os dois filtros. As linhas trazem `blockOrigin` e `sessions` de
    // proposito: o shape devolvido ao aluno nao pode repassar nenhum dos dois.
    it('exclui horario bloqueado pelo Google e horario de outro aluno, sem vazar blockOrigin nem sessao', async () => {
      type LinhaDoBanco = ReturnType<typeof makeSlot> & {
        blockOrigin: 'GOOGLE' | null;
        sessions: Array<{ id: string; studentId: string; status: string }>;
      };
      type Consulta = {
        where: { isBlocked: boolean; sessions: { none: { status: { in: string[] } } } };
      };
      const linhas: LinhaDoBanco[] = [
        { ...makeSlot({ id: 'slot-livre' }), blockOrigin: null, sessions: [] },
        { ...makeSlot({ id: 'slot-google', isBlocked: true }), blockOrigin: 'GOOGLE', sessions: [] },
        {
          ...makeSlot({ id: 'slot-outro-aluno' }),
          blockOrigin: null,
          sessions: [{ id: 'sessao-b', studentId: 'aluno-b', status: 'SCHEDULED' }],
        },
      ];
      mockPrisma.availabilitySlot.findMany.mockImplementation(async ({ where }: Consulta) =>
        linhas.filter(
          (linha) =>
            linha.isBlocked === where.isBlocked &&
            !linha.sessions.some((sessao) => where.sessions.none.status.in.includes(sessao.status)),
        ),
      );

      const result = await service.getAvailable('2026-03-01', '2026-04-01');

      expect(result.map((slot) => slot.id)).toEqual(['slot-livre']);
      const [args] = mockPrisma.availabilitySlot.findMany.mock.calls[0];
      expect(args.where.isBlocked).toBe(false);
      expect(args.where.sessions.none.status.in).toContain('SCHEDULED');
      for (const slot of result) {
        expect(Object.keys(slot).sort()).toEqual(['endAt', 'id', 'isBlocked', 'startAt']);
        expect(slot).not.toHaveProperty('blockOrigin');
        expect(slot).not.toHaveProperty('session');
        expect(slot).not.toHaveProperty('sessions');
        expect(slot).not.toHaveProperty('studentName');
      }
    });

    // O mock do Prisma nao filtra por `where`: o que prova o piso e a FORMA da
    // consulta. O corte observado pela tela esta travado em sessions-apifetch.test.ts.
    describe('piso no agora (item 033)', () => {
      const MEIO_DO_DIA = '2026-03-21T15:20:00.000Z';

      it('consulta no meio do dia usa o agora como piso exclusivo, nao o inicio do dia', async () => {
        congelarRelogio(MEIO_DO_DIA);
        mockPrisma.availabilitySlot.findMany.mockResolvedValue([
          makeSlot({
            id: 'slot-tarde',
            startAt: new Date('2026-03-21T17:00:00Z'),
            endAt: new Date('2026-03-21T17:50:00Z'),
          }),
        ]);

        const result = await service.getAvailable('2026-03-21', '2026-03-28');

        const [args] = mockPrisma.availabilitySlot.findMany.mock.calls[0];
        expect(args.where.startAt).toEqual({
          gt: new Date(MEIO_DO_DIA),
          lt: new Date('2026-03-28T00:00:00.000Z'),
        });
        expect(args.where.startAt.gte).toBeUndefined();
        expect(result.map((s) => s.id)).toEqual(['slot-tarde']);
      });

      it('mes corrente pedido pelo calendario (dia 1) corta tambem os dias ja passados', async () => {
        congelarRelogio(MEIO_DO_DIA);
        mockPrisma.availabilitySlot.findMany.mockResolvedValue([]);

        await service.getAvailable('2026-03-01', '2026-04-01');

        const [args] = mockPrisma.availabilitySlot.findMany.mock.calls[0];
        expect(args.where.startAt).toEqual({
          gt: new Date(MEIO_DO_DIA),
          lt: new Date('2026-04-01T00:00:00.000Z'),
        });
      });

      it('janela que comeca em dia futuro mantem o inicio do dia como piso inclusivo', async () => {
        congelarRelogio(MEIO_DO_DIA);
        mockPrisma.availabilitySlot.findMany.mockResolvedValue([]);

        await service.getAvailable('2026-03-22', '2026-03-29');

        const [args] = mockPrisma.availabilitySlot.findMany.mock.calls[0];
        expect(args.where.startAt).toEqual({
          gte: new Date('2026-03-22T00:00:00.000Z'),
          lt: new Date('2026-03-29T00:00:00.000Z'),
        });
      });

      it('janela inteira no passado devolve lista vazia sem consultar o banco', async () => {
        congelarRelogio(MEIO_DO_DIA);

        const result = await service.getAvailable('2026-02-01', '2026-03-01');

        expect(result).toEqual([]);
        expect(mockPrisma.availabilitySlot.findMany).not.toHaveBeenCalled();
      });
    });
  });

  // ── generateSlots ──
  //
  // Cada caso arma explicitamente `findMany` e `createMany` com `mockReset()` +
  // variante `...Once`. `vi.clearAllMocks()` do `beforeEach` zera chamadas mas
  // preserva implementacao, e nem `vitest.config.ts` nem `vitest.setup.ts` ligam
  // `clearMocks`/`restoreMocks`: sem o reset local, um caso consumiria o mock
  // armado por outro `describe` e o arquivo so passaria quando rodado inteiro.
  describe('generateSlots', () => {
    type ConsultaDedup = {
      where: { startAt: { in: Date[] } };
      select: { startAt: boolean };
    };
    type InsercaoLote = {
      data: Array<{ startAt: Date; endAt: Date }>;
      skipDuplicates: boolean;
    };

    beforeEach(() => {
      mockPrisma.availabilitySlot.findMany.mockReset();
      mockPrisma.availabilitySlot.createMany.mockReset();
      // Consulta de sobreposicao (item 017): segunda chamada de findMany em
      // generateSlots. Default vazio cobre os casos preexistentes, que so
      // observam a consulta de deduplicacao (primeira chamada); os casos do
      // item 017 armam ...Once adicional.
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([]);
    });

    it('emite um parametro por startAt distinto na consulta de deduplicacao', async () => {
      mockPrisma.availabilitySlot.findMany.mockResolvedValueOnce([]);
      mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 1 });

      // Duas faixas identicas: o mesmo horario e gerado duas vezes no mesmo pedido.
      await service.generateSlots({
        days: [1],
        ranges: [
          { start: '09:00', end: '10:00' },
          { start: '09:00', end: '10:00' },
        ],
        weeksAhead: 1,
        timezone: 'America/Sao_Paulo',
      });

      expect(mockPrisma.availabilitySlot.findMany).toHaveBeenCalledTimes(2);
      // Primeira chamada: deduplicacao por startAt. A segunda e a consulta de
      // sobreposicao do item 017, fora do escopo deste caso.
      const consulta = mockPrisma.availabilitySlot.findMany.mock.calls[0][0] as ConsultaDedup;
      const parametros = consulta.where.startAt.in;

      // Um parametro por horario distinto, sem repeticao.
      expect(new Set(parametros.map((d) => d.getTime())).size).toBe(parametros.length);
      expect(parametros).toHaveLength(1);
      // O shape da consulta faz parte do aceite: so `startAt` e projetado.
      expect(consulta.select).toEqual({ startAt: true });
    });

    it('deduplica contra o que ja existe no banco com mais de um startAt', async () => {
      let solicitados: Date[] = [];
      let jaExistentes: Date[] = [];

      // O retorno e derivado da propria consulta emitida: `localTimeToUtc` resolve o
      // offset via Intl sobre a data corrente, entao literal de UTC tornaria o teste
      // dependente do dia em que ele roda.
      mockPrisma.availabilitySlot.findMany.mockImplementationOnce(
        async (args: ConsultaDedup) => {
          solicitados = args.where.startAt.in;
          jaExistentes = solicitados.slice(0, 2);
          return jaExistentes.map((startAt) => ({ startAt }));
        },
      );
      mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.generateSlots({
        days: [1],
        ranges: [{ start: '09:00', end: '12:00' }],
        weeksAhead: 1,
        timezone: 'America/Sao_Paulo',
      });

      expect(solicitados.length).toBeGreaterThanOrEqual(3);
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.created + result.skipped).toBe(solicitados.length);

      const insercao = mockPrisma.availabilitySlot.createMany.mock.calls[0][0] as InsercaoLote;
      const inseridos = insercao.data.map((s) => s.startAt.getTime());
      for (const existente of jaExistentes) {
        expect(inseridos).not.toContain(existente.getTime());
      }
    });

    it('nao conta duas vezes o mesmo horario repetido no lote', async () => {
      mockPrisma.availabilitySlot.findMany.mockResolvedValueOnce([]);
      // O banco aceita uma linha so: `startAt` e @unique e `skipDuplicates` engole a colisao.
      mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.generateSlots({
        days: [1],
        ranges: [
          { start: '09:00', end: '10:00' },
          { start: '09:00', end: '10:00' },
        ],
        weeksAhead: 1,
        timezone: 'America/Sao_Paulo',
      });

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('sinaliza erro quando a geracao nao produz nenhum horario', async () => {
      const erro = await service
        .generateSlots({
          days: [],
          ranges: [{ start: '09:00', end: '10:00' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        })
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(AppError);
      expect((erro as AppError).code).toBe('AVAILABILITY_070');
      expect((erro as AppError).status).toBe(400);
      expect(mockPrisma.availabilitySlot.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.availabilitySlot.createMany).not.toHaveBeenCalled();
    });

    // `days: []` acima nao atravessa a rota (`GenerateSlotsSchema` exige `.min(1)`).
    // Este e o caminho que o professor de fato produz: faixa mais curta que uma aula.
    it('sinaliza erro quando a faixa e curta demais para uma aula', async () => {
      const erro = await service
        .generateSlots({
          days: [1],
          ranges: [{ start: '09:00', end: '09:30' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        })
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(AppError);
      expect((erro as AppError).code).toBe('AVAILABILITY_070');
      expect((erro as AppError).status).toBe(400);
      expect(mockPrisma.availabilitySlot.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.availabilitySlot.createMany).not.toHaveBeenCalled();
    });

    // Guarda da fronteira: `created === 0` apos a deduplicacao e sucesso legitimo
    // (os horarios ja existiam), nao intervalo invalido. O guard olha para
    // `slotsToCreate.length`, nunca para o resultado da deduplicacao.
    it('nao sinaliza erro quando os horarios foram gerados e ja existiam', async () => {
      mockPrisma.availabilitySlot.findMany.mockImplementationOnce(
        async (args: ConsultaDedup) => args.where.startAt.in.map((startAt) => ({ startAt })),
      );

      const result = await service.generateSlots({
        days: [1],
        ranges: [{ start: '09:00', end: '12:00' }],
        weeksAhead: 1,
        timezone: 'America/Sao_Paulo',
      });

      expect(result.created).toBe(0);
      expect(result.skipped).toBeGreaterThan(0);
      expect(mockPrisma.availabilitySlot.createMany).not.toHaveBeenCalled();
    });

    // ── Ocupacao externa vigente (item 016) ──
    //
    // O aceite e sobre o ARGUMENTO do createMany (a linha que nasce), nao sobre
    // o retorno. A ocupacao de cada caso e derivada da propria janela consultada,
    // como nos casos de deduplicacao: `localTimeToUtc` resolve offset via Intl
    // sobre a data corrente, entao literal de UTC tornaria o teste dependente do
    // dia em que ele roda.
    describe('ocupacao externa vigente', () => {
      it('slot dentro da ocupacao vai ao createMany bloqueado com origem GOOGLE, vizinho vai livre', async () => {
        mockPrisma.availabilitySlot.findMany.mockResolvedValueOnce([]);
        // Ocupacao cobrindo so o PRIMEIRO slot do lote (25 min dentro dos 50).
        mockPrisma.externalBusyInterval.findMany.mockImplementationOnce(async (args: {
          where: { startAt: { lt: Date }; endAt: { gt: Date } };
        }) => {
          const inicio = args.where.endAt.gt;
          return [
            {
              id: 'int-1',
              externalEventId: 'evt-1',
              startAt: inicio,
              endAt: new Date(inicio.getTime() + 25 * 60 * 1000),
              revokedAt: null,
              syncedAt: inicio,
              createdAt: inicio,
              updatedAt: inicio,
            },
          ];
        });
        mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 2 });

        // 09:00-10:40 produz dois slots de 50 min: 09:00 e 09:50.
        await service.generateSlots({
          days: [1],
          ranges: [{ start: '09:00', end: '10:40' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        });

        const insercao = mockPrisma.availabilitySlot.createMany.mock.calls[0][0] as {
          data: Array<{ startAt: Date; endAt: Date; isBlocked?: boolean; blockOrigin?: string }>;
          skipDuplicates: boolean;
        };
        expect(insercao.data).toHaveLength(2);

        const [coberto, livre] = insercao.data;
        expect(coberto.isBlocked).toBe(true);
        expect(coberto.blockOrigin).toBe('GOOGLE');
        // Linha fora da ocupacao nasce exatamente como antes da existencia do ledger.
        expect(livre.isBlocked).toBeUndefined();
        expect(livre.blockOrigin).toBeUndefined();
        expect(insercao.skipDuplicates).toBe(true);
      });

      it('created e skipped continuam somando totalPedido quando ha cobertura', async () => {
        mockPrisma.availabilitySlot.findMany.mockResolvedValueOnce([]);
        mockPrisma.externalBusyInterval.findMany.mockImplementationOnce(async (args: {
          where: { endAt: { gt: Date } };
        }) => {
          const inicio = args.where.endAt.gt;
          return [
            {
              id: 'int-1',
              externalEventId: 'evt-1',
              startAt: inicio,
              endAt: new Date(inicio.getTime() + 25 * 60 * 1000),
              revokedAt: null,
              syncedAt: inicio,
              createdAt: inicio,
              updatedAt: inicio,
            },
          ];
        });
        mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 2 });

        const result = await service.generateSlots({
          days: [1],
          ranges: [{ start: '09:00', end: '10:40' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        });

        // Cobrir slot nao muda a contabilidade: a linha coberta continua sendo
        // linha criada, e o professor continua vendo o mesmo total.
        expect(result.created).toBe(2);
        expect(result.created + result.skipped).toBe(2);
      });

      it('ledger vazio nao muda nada do comportamento atual', async () => {
        mockPrisma.availabilitySlot.findMany.mockResolvedValueOnce([]);
        mockPrisma.externalBusyInterval.findMany.mockResolvedValueOnce([]);
        mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 2 });

        await service.generateSlots({
          days: [1],
          ranges: [{ start: '09:00', end: '10:40' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        });

        const insercao = mockPrisma.availabilitySlot.createMany.mock.calls[0][0] as {
          data: Array<{ startAt: Date; endAt: Date; isBlocked?: boolean; blockOrigin?: string }>;
        };
        for (const linha of insercao.data) {
          expect(linha.isBlocked).toBeUndefined();
          expect(linha.blockOrigin).toBeUndefined();
        }
      });

      it('nao consulta o ledger quando nao ha slot novo (tudo ja existia)', async () => {
        mockPrisma.availabilitySlot.findMany.mockImplementationOnce(
          async (args: ConsultaDedup) => args.where.startAt.in.map((startAt) => ({ startAt })),
        );

        await service.generateSlots({
          days: [1],
          ranges: [{ start: '09:00', end: '12:00' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        });

        expect(mockPrisma.externalBusyInterval.findMany).not.toHaveBeenCalled();
        expect(mockPrisma.availabilitySlot.createMany).not.toHaveBeenCalled();
      });

      it('consulta o ledger na janela [min(startAt), max(endAt)] do lote, nao na janela pedida', async () => {
        mockPrisma.availabilitySlot.findMany.mockResolvedValueOnce([]);
        mockPrisma.externalBusyInterval.findMany.mockResolvedValueOnce([]);
        mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 2 });

        await service.generateSlots({
          days: [1],
          ranges: [{ start: '09:00', end: '10:40' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        });

        const consulta = mockPrisma.externalBusyInterval.findMany.mock.calls[0][0] as {
          where: {
            revokedAt: null;
            startAt: { lt: Date };
            endAt: { gt: Date };
          };
        };
        expect(consulta.where.revokedAt).toBeNull();
        const insercao = mockPrisma.availabilitySlot.createMany.mock.calls[0][0] as {
          data: Array<{ startAt: Date; endAt: Date }>;
        };
        const inicios = insercao.data.map((s) => s.startAt.getTime());
        const fins = insercao.data.map((s) => s.endAt.getTime());
        expect(consulta.where.endAt.gt.getTime()).toBe(Math.min(...inicios));
        expect(consulta.where.startAt.lt.getTime()).toBe(Math.max(...fins));
      });
    });

    // ── Sobreposicao de intervalo (item 017) ──
    //
    // Duas fontes de rejeicao, ambas observadas no argumento do createMany:
    // candidato sobreposto a outro candidato do mesmo lote e candidato
    // sobreposto a slot ja bloqueado / com sessao viva lido do banco. A
    // ocupacao externa (LEDGER) nao rejeita: faz o slot nascer bloqueado, e
    // os casos dela ficam na suite do item 016.
    describe('sobreposicao de intervalo (item 017)', () => {
      it('rejeita candidato sobreposto a outro candidato do mesmo lote', async () => {
        mockPrisma.availabilitySlot.findMany.mockResolvedValueOnce([]);
        mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 2 });

        // 09:00-10:40 gera 09:00 e 09:50; a faixa 10:00-11:00 gera 10:00,
        // que intersecta 09:50-10:40 e precisa cair para skipped.
        const result = await service.generateSlots({
          days: [1],
          ranges: [
            { start: '09:00', end: '10:40' },
            { start: '10:00', end: '11:00' },
          ],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        });

        expect(result.created).toBe(2);
        expect(result.skipped).toBe(1);

        const insercao = mockPrisma.availabilitySlot.createMany.mock.calls[0][0] as InsercaoLote;
        expect(insercao.data).toHaveLength(2);
        // Nenhum par sobreposto sobrevive ao lote enviado ao banco.
        for (const a of insercao.data) {
          for (const b of insercao.data) {
            if (a === b) continue;
            const sobreposto = a.startAt < b.endAt && a.endAt > b.startAt;
            expect(sobreposto).toBe(false);
          }
        }
      });

      it('rejeita candidato sobreposto a slot bloqueado existente de startAt distinto', async () => {
        let solicitados: Date[] = [];
        // Primeira chamada: deduplicacao. Segunda: consulta de sobreposicao,
        // com um slot bloqueado cobrindo os 25 primeiros minutos da janela,
        // derivada do proprio argumento como nos casos do ledger.
        mockPrisma.availabilitySlot.findMany.mockImplementationOnce(async (args: ConsultaDedup) => {
          solicitados = args.where.startAt.in;
          return [];
        });
        mockPrisma.availabilitySlot.findMany.mockImplementationOnce(
          async (args: { where: { endAt: { gt: Date } } }) => {
            const inicio = args.where.endAt.gt;
            return [
              {
                startAt: inicio,
                endAt: new Date(inicio.getTime() + 25 * 60 * 1000),
              },
            ];
          },
        );
        mockPrisma.availabilitySlot.createMany.mockResolvedValueOnce({ count: 1 });

        // 09:00-11:00 gera 09:00 e 09:50; o bloqueio cobre so o primeiro.
        const result = await service.generateSlots({
          days: [1],
          ranges: [{ start: '09:00', end: '11:00' }],
          weeksAhead: 1,
          timezone: 'America/Sao_Paulo',
        });

        expect(result.created).toBe(1);
        expect(result.skipped).toBe(1);

        const insercao = mockPrisma.availabilitySlot.createMany.mock.calls[0][0] as InsercaoLote;
        expect(insercao.data).toHaveLength(1);
        expect(insercao.data[0].startAt.getTime()).not.toBe(solicitados[0].getTime());
      });
    });
  });

  // ── blockSlot ──
  describe('blockSlot', () => {
    it('abre uma unica transacao e le o slot com FOR UPDATE', async () => {
      const tx = armarTx({});

      await service.blockSlot('slot-1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as string[];
      expect(sql.join('?')).toContain('FOR UPDATE');
      expect(sql.join('?')).toContain('availability_slots');
      expect(mockPrisma.availabilitySlot.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.availabilitySlot.update).not.toHaveBeenCalled();
    });

    it('grava por CAS na version lida sob o lock e incrementa', async () => {
      const tx = armarTx({ row: { id: 'slot-1', isBlocked: 0, version: 3 } });

      await service.blockSlot('slot-1');

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const call = tx.$executeRaw.mock.calls[0] as unknown[];
      const sql = (call[0] as string[]).join('?');
      expect(sql).toContain('isBlocked = true');
      expect(sql).toContain('blockOrigin =');
      expect(sql).toContain('version = version + 1');
      expect(sql).toContain('AND version =');
      // o parametro de version e o valor lido sob o lock, nao outro
      expect(call.slice(1)).toContain(3);
    });

    it('re-checa ocupante dentro da transacao com os dois status literais', async () => {
      const tx = armarTx({});

      await service.blockSlot('slot-1');

      expect(tx.session.findFirst).toHaveBeenCalledWith({
        where: {
          availabilitySlotId: 'slot-1',
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        },
        select: { id: true },
      });
    });

    it('should throw AVAILABILITY_001 when slot not found', async () => {
      const tx = armarTx({ row: null });

      await expect(service.blockSlot('missing')).rejects.toThrow(AppError);
      try {
        await service.blockSlot('missing');
      } catch (err) {
        expect((err as AppError).code).toBe('AVAILABILITY_001');
        expect((err as AppError).status).toBe(404);
      }
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('should throw AVAILABILITY_050 when slot already blocked', async () => {
      const tx = armarTx({ row: { id: 'slot-1', isBlocked: 1, version: 3 } });

      await expect(service.blockSlot('slot-1')).rejects.toThrow(AppError);
      try {
        await service.blockSlot('slot-1');
      } catch (err) {
        expect((err as AppError).code).toBe('AVAILABILITY_050');
        expect((err as AppError).status).toBe(409);
      }
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('should throw AVAILABILITY_051 when slot has active session', async () => {
      const tx = armarTx({ occupant: { id: 'session-1' } });

      await expect(service.blockSlot('slot-1')).rejects.toThrow(AppError);
      try {
        await service.blockSlot('slot-1');
      } catch (err) {
        expect((err as AppError).code).toBe('AVAILABILITY_051');
        expect((err as AppError).status).toBe(409);
        expect((err as AppError).details).toEqual({ sessionId: 'session-1' });
      }
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('should throw AVAILABILITY_053 when CAS nao afeta linha', async () => {
      armarTx({ cas: 0 });

      await expect(service.blockSlot('slot-1')).rejects.toThrow(AppError);
      try {
        await service.blockSlot('slot-1');
      } catch (err) {
        expect((err as AppError).code).toBe('AVAILABILITY_053');
        expect((err as AppError).status).toBe(409);
      }
    });

    it.each([
      ['P2028', erroPrisma('P2028', 'Transaction already closed: transaction timed out')],
      ['P2034', erroPrisma('P2034', 'Transaction failed due to a write conflict or a deadlock')],
      ['meta.code 1205 (P2010)', erroPrisma('P2010', 'Raw query failed', { code: '1205' })],
      ['meta.errno 1213 (P2010)', erroPrisma('P2010', 'Raw query failed', { errno: 1213 })],
      ['errno cru 1205', erroDriver(1205, 'ER_LOCK_WAIT_TIMEOUT', 'Lock wait timeout exceeded')],
      ['errno cru 1213', erroDriver(1213, 'ER_LOCK_DEADLOCK', 'Deadlock found when trying to get lock')],
      [
        'P2010 sem meta, errno so no texto',
        erroPrisma('P2010', 'Raw query failed. Error 1213: Deadlock found when trying to get lock'),
      ],
    ])(
      'traduz contencao %s para AVAILABILITY_054 / 409 em vez de vazar erro cru',
      async (_rotulo, err) => {
        armarTxContencao(err);

        try {
          await service.blockSlot('slot-1');
          throw new Error('deveria ter rejeitado');
        } catch (caught) {
          expect(caught).toBeInstanceOf(AppError);
          expect((caught as AppError).code).toBe('AVAILABILITY_054');
          expect((caught as AppError).status).toBe(409);
        }
      },
    );

    it('nao mascara falha real de banco como conflito', async () => {
      const falhaReal = erroPrisma('P1001', "Can't reach database server");
      armarTxContencao(falhaReal);

      await expect(service.blockSlot('slot-1')).rejects.toBe(falhaReal);
    });

    // Contraprova da matriz acima: sem estes casos, um matcher que so olhasse o
    // texto passaria nos sete positivos por acidente. Aqui os numeros 1205/1213
    // aparecem na mensagem SEM serem errno de contencao, e o erro tem de subir
    // cru em vez de virar AVAILABILITY_054.
    it.each([
      [
        '1205 dentro de um identificador',
        erroPrisma('P2010', 'Raw query failed: duplicate entry for slot-1205-abc'),
      ],
      [
        '1213 numa contagem de linhas',
        erroPrisma('P2010', 'Raw query failed. Error: unknown column at row 1213'),
      ],
      ['1213 em erro sem code nem errno', new Error('job 1213 falhou ao gerar slots')],
      [
        'errno de FK (1452), que nao e contencao',
        erroPrisma('P2010', 'Raw query failed', { code: '1452' }),
      ],
      [
        'timeout de rede com 1205 no texto',
        erroPrisma('P1017', 'Server has closed the connection after 1205 ms'),
      ],
    ])('nao trata %s como contencao', async (_rotulo, err) => {
      armarTxContencao(err);

      await expect(service.blockSlot('slot-1')).rejects.toBe(err);
    });

    // ── origem do bloqueio (item 015) ──
    // Uma linha por transicao da primeira tabela do objetivo do item: a decisao passa a ser
    // pela ORIGEM, nao por `isBlocked`.
    describe('origem do bloqueio', () => {
      function paramsDoCas(tx: ReturnType<typeof armarTx>) {
        const call = tx.$executeRaw.mock.calls[0] as unknown[];
        return { sql: (call[0] as string[]).join('?'), params: call.slice(1) };
      }

      it('slot livre bloqueado por MANUAL grava MANUAL', async () => {
        const tx = armarTx({ row: { id: 'slot-1', isBlocked: 0, version: 3, blockOrigin: null } });

        await service.blockSlot('slot-1', 'MANUAL');

        const { sql, params } = paramsDoCas(tx);
        expect(params).toContain('MANUAL');
        expect(sql).toContain('isBlocked = true');
        expect(sql).toContain('AND version =');
        expect(params).toContain(3);
      });

      it('slot livre bloqueado por GOOGLE grava GOOGLE', async () => {
        const tx = armarTx({ row: { id: 'slot-1', isBlocked: 0, version: 3, blockOrigin: null } });

        await service.blockSlot('slot-1', 'GOOGLE');

        const { params } = paramsDoCas(tx);
        expect(params).toContain('GOOGLE');
      });

      it('slot MANUAL bloqueado por GOOGLE vira BOTH', async () => {
        const tx = armarTx({
          row: { id: 'slot-1', isBlocked: 1, version: 3, blockOrigin: 'MANUAL' },
        });

        await service.blockSlot('slot-1', 'GOOGLE');

        const { sql, params } = paramsDoCas(tx);
        expect(params).toContain('BOTH');
        expect(sql).toContain('isBlocked = true');
        expect(sql).toContain('AND version =');
      });

      it('slot GOOGLE bloqueado por MANUAL vira BOTH', async () => {
        const tx = armarTx({
          row: { id: 'slot-1', isBlocked: 1, version: 3, blockOrigin: 'GOOGLE' },
        });

        await service.blockSlot('slot-1', 'MANUAL');

        expect(paramsDoCas(tx).params).toContain('BOTH');
      });

      it('bloquear duas vezes pela MESMA origem lanca AVAILABILITY_050', async () => {
        const tx = armarTx({
          row: { id: 'slot-1', isBlocked: 1, version: 3, blockOrigin: 'GOOGLE' },
        });

        try {
          await service.blockSlot('slot-1', 'GOOGLE');
          throw new Error('deveria ter rejeitado');
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('AVAILABILITY_050');
          expect((err as AppError).status).toBe(409);
        }
        expect(tx.$executeRaw).not.toHaveBeenCalled();
      });

      it.each(['MANUAL', 'GOOGLE'] as const)(
        'slot BOTH recusa bloqueio por %s com AVAILABILITY_050',
        async (origem) => {
          const tx = armarTx({
            row: { id: 'slot-1', isBlocked: 1, version: 3, blockOrigin: 'BOTH' },
          });

          try {
            await service.blockSlot('slot-1', origem);
            throw new Error('deveria ter rejeitado');
          } catch (err) {
            expect(err).toBeInstanceOf(AppError);
            expect((err as AppError).code).toBe('AVAILABILITY_050');
            expect((err as AppError).status).toBe(409);
          }
          expect(tx.$executeRaw).not.toHaveBeenCalled();
        },
      );

      // Decisao de ST003: a transicao para BOTH parte de slot JA bloqueado, onde nenhuma
      // sessao nova pode ter entrado. Rodar a re-checagem ali mudaria um caminho fechado.
      it('nao re-checa ocupante na transicao para BOTH, mesmo com ocupante armado', async () => {
        const tx = armarTx({
          row: { id: 'slot-1', isBlocked: 1, version: 3, blockOrigin: 'MANUAL' },
          occupant: { id: 'session-1' },
        });

        await service.blockSlot('slot-1', 'GOOGLE');

        expect(tx.session.findFirst).not.toHaveBeenCalled();
        expect(paramsDoCas(tx).params).toContain('BOTH');
      });

      it('sem origem explicita, bloqueia como MANUAL (default das rotas HTTP)', async () => {
        const tx = armarTx({ row: { id: 'slot-1', isBlocked: 0, version: 3, blockOrigin: null } });

        await service.blockSlot('slot-1');

        expect(paramsDoCas(tx).params).toContain('MANUAL');
      });
    });
  });

  // ── unblockSlot ──
  describe('unblockSlot', () => {
    it('abre uma unica transacao e le o slot com FOR UPDATE', async () => {
      const tx = armarTx({ row: { id: 'slot-1', isBlocked: 1, version: 5 } });

      await service.unblockSlot('slot-1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as string[];
      expect(sql.join('?')).toContain('FOR UPDATE');
      expect(sql.join('?')).toContain('availability_slots');
      expect(mockPrisma.availabilitySlot.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.availabilitySlot.update).not.toHaveBeenCalled();
    });

    it('grava por CAS e incrementa version', async () => {
      const tx = armarTx({ row: { id: 'slot-1', isBlocked: 1, version: 5 } });

      await service.unblockSlot('slot-1');

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const call = tx.$executeRaw.mock.calls[0] as unknown[];
      const sql = (call[0] as string[]).join('?');
      expect(sql).toContain('isBlocked =');
      expect(sql).toContain('blockOrigin =');
      expect(sql).toContain('version = version + 1');
      expect(sql).toContain('AND version =');
      expect(call.slice(1)).toContain(5);
    });

    it('should throw AVAILABILITY_001 when slot not found', async () => {
      const tx = armarTx({ row: null });

      await expect(service.unblockSlot('missing')).rejects.toThrow(AppError);
      try {
        await service.unblockSlot('missing');
      } catch (err) {
        expect((err as AppError).code).toBe('AVAILABILITY_001');
        expect((err as AppError).status).toBe(404);
      }
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('should throw AVAILABILITY_052 when slot already unblocked', async () => {
      const tx = armarTx({ row: { id: 'slot-1', isBlocked: 0, version: 5 } });

      await expect(service.unblockSlot('slot-1')).rejects.toThrow(AppError);
      try {
        await service.unblockSlot('slot-1');
      } catch (err) {
        expect((err as AppError).code).toBe('AVAILABILITY_052');
        expect((err as AppError).status).toBe(409);
      }
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('should throw AVAILABILITY_053 when CAS nao afeta linha', async () => {
      armarTx({ row: { id: 'slot-1', isBlocked: 1, version: 5 }, cas: 0 });

      await expect(service.unblockSlot('slot-1')).rejects.toThrow(AppError);
      try {
        await service.unblockSlot('slot-1');
      } catch (err) {
        expect((err as AppError).code).toBe('AVAILABILITY_053');
        expect((err as AppError).status).toBe(409);
      }
    });

    it('traduz contencao para AVAILABILITY_054 / 409', async () => {
      armarTxContencao(
        erroPrisma('P2034', 'Transaction failed due to a write conflict or a deadlock'),
      );

      try {
        await service.unblockSlot('slot-1');
        throw new Error('deveria ter rejeitado');
      } catch (caught) {
        expect(caught).toBeInstanceOf(AppError);
        expect((caught as AppError).code).toBe('AVAILABILITY_054');
        expect((caught as AppError).status).toBe(409);
      }
    });

    // ── origem do bloqueio (item 015) ──
    // Uma linha por transicao da segunda tabela do objetivo do item. O aceite central do
    // item vive aqui: desfazer uma origem de um slot BOTH nao desfaz a outra.
    describe('origem do bloqueio', () => {
      function paramsDoCas(tx: ReturnType<typeof armarTx>) {
        const call = tx.$executeRaw.mock.calls[0] as unknown[];
        return { sql: (call[0] as string[]).join('?'), params: call.slice(1) };
      }

      it('BOTH menos MANUAL deixa GOOGLE com isBlocked verdadeiro', async () => {
        const tx = armarTx({ row: { id: 'slot-1', isBlocked: 1, version: 5, blockOrigin: 'BOTH' } });

        await service.unblockSlot('slot-1', 'MANUAL');

        const { sql, params } = paramsDoCas(tx);
        expect(params).toContain('GOOGLE');
        expect(params).toContain(true);
        expect(sql).toContain('AND version =');
        expect(params).toContain(5);
      });

      it('BOTH menos GOOGLE deixa MANUAL com isBlocked verdadeiro', async () => {
        const tx = armarTx({ row: { id: 'slot-1', isBlocked: 1, version: 5, blockOrigin: 'BOTH' } });

        await service.unblockSlot('slot-1', 'GOOGLE');

        const { params } = paramsDoCas(tx);
        expect(params).toContain('MANUAL');
        expect(params).toContain(true);
      });

      it('origem unica igual a pedida libera o slot (origem nula, isBlocked falso)', async () => {
        const tx = armarTx({
          row: { id: 'slot-1', isBlocked: 1, version: 5, blockOrigin: 'MANUAL' },
        });

        await service.unblockSlot('slot-1', 'MANUAL');

        const { params } = paramsDoCas(tx);
        expect(params).toContain(null);
        expect(params).toContain(false);
      });

      it('origem divergente lanca AVAILABILITY_052 com mensagem propria', async () => {
        const tx = armarTx({
          row: { id: 'slot-1', isBlocked: 1, version: 5, blockOrigin: 'GOOGLE' },
        });

        try {
          await service.unblockSlot('slot-1', 'MANUAL');
          throw new Error('deveria ter rejeitado');
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('AVAILABILITY_052');
          expect((err as AppError).status).toBe(409);
          expect((err as AppError).message).toBe('Slot não possui bloqueio desta origem.');
        }
        expect(tx.$executeRaw).not.toHaveBeenCalled();
      });

      it('slot sem origem lanca AVAILABILITY_052 com a mensagem de ja desbloqueado', async () => {
        const tx = armarTx({ row: { id: 'slot-1', isBlocked: 0, version: 5, blockOrigin: null } });

        try {
          await service.unblockSlot('slot-1', 'MANUAL');
          throw new Error('deveria ter rejeitado');
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe('AVAILABILITY_052');
          expect((err as AppError).message).toBe('Slot já está desbloqueado.');
        }
        expect(tx.$executeRaw).not.toHaveBeenCalled();
      });

      it('sem origem explicita, desbloqueia como MANUAL (default das rotas HTTP)', async () => {
        const tx = armarTx({ row: { id: 'slot-1', isBlocked: 1, version: 5, blockOrigin: 'BOTH' } });

        await service.unblockSlot('slot-1');

        expect(paramsDoCas(tx).params).toContain('GOOGLE');
      });
    });
  });

  // ── deleteEmpty ──
  describe('deleteEmpty', () => {
    it('should delete a slot without sessions', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue({
        ...makeSlot(),
        sessions: [],
      });
      mockPrisma.availabilitySlot.delete.mockResolvedValue(makeSlot());

      await service.deleteEmpty('slot-1');
      expect(mockPrisma.availabilitySlot.delete).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
      });
    });

    it('should throw AVAILABILITY_001 when slot not found', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue(null);

      await expect(service.deleteEmpty('missing')).rejects.toThrow(AppError);
    });

    it('should throw AVAILABILITY_060 when slot has associated session', async () => {
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue({
        ...makeSlot(),
        sessions: [{ id: 'session-1', status: 'SCHEDULED' }],
      });

      await expect(service.deleteEmpty('slot-1')).rejects.toThrow(AppError);
      try {
        await service.deleteEmpty('slot-1');
      } catch (err) {
        expect((err as AppError).status).toBe(409);
        expect((err as AppError).code).toBe('AVAILABILITY_060');
      }
    });

    it('should throw AVAILABILITY_061 when slot only has cancelled history', async () => {
      // A sessao cancelada nao ocupa mais o slot, mas a FK
      // `sessions_availabilitySlotId_fkey` continua apontando para ele: deletar
      // quebraria com erro de FK cru, entao vira 409 explicito.
      mockPrisma.availabilitySlot.findUnique.mockResolvedValue({
        ...makeSlot(),
        sessions: [{ id: 'session-1', status: 'CANCELLED_BY_STUDENT' }],
      });

      try {
        await service.deleteEmpty('slot-1');
        throw new Error('deveria ter lancado');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).status).toBe(409);
        expect((err as AppError).code).toBe('AVAILABILITY_061');
      }
      expect(mockPrisma.availabilitySlot.delete).not.toHaveBeenCalled();
    });
  });
});
