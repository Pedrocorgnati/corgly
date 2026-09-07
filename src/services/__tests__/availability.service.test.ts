// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  row?: { id: string; isBlocked: number; version: number } | null;
  occupant?: { id: string } | null;
  cas?: number;
}) {
  const { row = { id: 'slot-1', isBlocked: 0, version: 3 }, occupant = null, cas = 1 } = options;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(row ? [row] : []),
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
  });

  // ── getAvailable ──
  describe('getAvailable', () => {
    it('should query exactly the window received and return non-blocked slots without sessions', async () => {
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot()]);

      const result = await service.getAvailable('2026-03-01', '2026-04-01');

      // A janela consultada e exatamente a recebida: nenhuma constante de sete
      // dias sobrevive dentro do servico.
      const [args] = mockPrisma.availabilitySlot.findMany.mock.calls[0];
      expect(args.where.startAt.gte).toEqual(new Date('2026-03-01T00:00:00.000Z'));
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

      expect(mockPrisma.availabilitySlot.findMany).toHaveBeenCalledTimes(1);
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
      expect(sql).toContain('SET isBlocked = true, version = version + 1');
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
      expect(sql).toContain('SET isBlocked = false, version = version + 1');
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
