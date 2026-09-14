// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '@/lib/errors';
import { ExternalBusyService } from '../external-busy.service';
import { cobre } from '../external-busy.repository';

// ── Mocks ──
// O alvo aqui e a projecao do ledger no slot, nao a transacao do item 012 (que
// tem suite propria em availability.blockslot-race.test.ts): blockSlot e
// unblockSlot sao mockados como funcoes e a classificacao de desfechos e
// verificada um a um contra a tabela do item 016. Hoisted junto com o mockPrisma
// porque o factory de vi.mock roda antes das declaracoes do modulo.
const mockPrisma = vi.hoisted(() => ({
  externalBusyInterval: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  availabilitySlot: {
    findMany: vi.fn(),
  },
  // Item 025: o destinatario do aviso e resolvido dentro do servico.
  user: {
    findFirst: vi.fn(),
  },
  // Presente so para provar que a sessao NAO e tocada (F8).
  session: {
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockAvailability = vi.hoisted(() => ({
  blockSlot: vi.fn(),
  unblockSlot: vi.fn(),
}));

// Item 025: o ledger de conflitos e mockado como repositorio (mesmo padrao do
// ledger de ocupacao) para que o alvo do teste seja a DECISAO do servico
// (persistir, notificar uma vez, resolver), nao o Prisma.
const mockConflitos = vi.hoisted(() => ({
  openConflict: vi.fn(),
  claimNotification: vi.fn(),
  markNotified: vi.fn(),
  releaseNotificationClaim: vi.fn(),
  resolveByInterval: vi.fn(),
  resolveOutsideWindow: vi.fn(),
  resolveBySlot: vi.fn(),
}));

const mockEmail = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

vi.mock('@/services/availability.service', () => ({
  availabilityService: {
    blockSlot: mockAvailability.blockSlot,
    unblockSlot: mockAvailability.unblockSlot,
  },
}));

vi.mock('../external-busy-conflict.repository', () => ({
  openConflict: mockConflitos.openConflict,
  claimNotification: mockConflitos.claimNotification,
  markNotified: mockConflitos.markNotified,
  releaseNotificationClaim: mockConflitos.releaseNotificationClaim,
  resolveByInterval: mockConflitos.resolveByInterval,
  resolveOutsideWindow: mockConflitos.resolveOutsideWindow,
  resolveBySlot: mockConflitos.resolveBySlot,
}));

vi.mock('@/services/email.service', () => ({
  emailService: { send: mockEmail.send },
}));

// Silencia o logger: o caminho best-effort do aviso registra error de proposito.
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const blockSlotMock = mockAvailability.blockSlot;
const unblockSlotMock = mockAvailability.unblockSlot;

// ── Fixtures ──
const T = (hh: number, mm = 0) => new Date(Date.UTC(2026, 2, 22, hh, mm));

function makeIntervalo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'int-1',
    externalEventId: 'evt-1',
    startAt: T(14),
    endAt: T(15),
    revokedAt: null,
    syncedAt: T(10),
    createdAt: T(10),
    updatedAt: T(10),
    ...overrides,
  };
}

function makeSlot(id: string, startAt: Date, endAt: Date, blockOrigin: string | null = null) {
  return { id, startAt, endAt, blockOrigin };
}

describe('ExternalBusyService', () => {
  let service: ExternalBusyService;

  beforeEach(() => {
    service = new ExternalBusyService();
    vi.clearAllMocks();
    mockConflitos.resolveBySlot.mockResolvedValue(0);
    mockConflitos.resolveByInterval.mockResolvedValue(0);
    mockConflitos.resolveOutsideWindow.mockResolvedValue(0);
    mockConflitos.claimNotification.mockResolvedValue(true);
    mockConflitos.markNotified.mockResolvedValue(true);
    mockConflitos.releaseNotificationClaim.mockResolvedValue(true);
    mockEmail.send.mockResolvedValue(undefined);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'user-prof',
      email: 'professor@corgly.test',
      preferredLanguage: 'PT_BR',
    });
  });

  describe('recordBusy', () => {
    it('grava com revokedAt null tanto no create quanto no update do upsert', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([]);

      await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
        syncedAt: T(10),
      });

      const args = mockPrisma.externalBusyInterval.upsert.mock.calls[0][0];
      expect(args.create.revokedAt).toBeNull();
      expect(args.update.revokedAt).toBeNull();
    });

    it('recusa endAt <= startAt com EXTERNAL_BUSY_001/400 sem tocar o banco', async () => {
      const erro = await service
        .recordBusy({ externalEventId: 'evt-1', startAt: T(15), endAt: T(14) })
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(AppError);
      expect((erro as AppError).code).toBe('EXTERNAL_BUSY_001');
      expect((erro as AppError).status).toBe(400);
      // validarIntervalo roda antes de qualquer leitura: nem findUnique da
      // janela anterior, nem upsert, nem a consulta de slots cobertos disparam.
      expect(mockPrisma.externalBusyInterval.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.externalBusyInterval.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.availabilitySlot.findMany).not.toHaveBeenCalled();
    });

    it('recusa externalEventId vazio com EXTERNAL_BUSY_002/400', async () => {
      const erro = await service
        .recordBusy({ externalEventId: '   ', startAt: T(14), endAt: T(15) })
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(AppError);
      expect((erro as AppError).code).toBe('EXTERNAL_BUSY_002');
      expect((erro as AppError).status).toBe(400);
      expect(mockPrisma.externalBusyInterval.upsert).not.toHaveBeenCalled();
    });

    it('bloqueia uma vez por slot coberto e devolve os ids em bloqueados', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([
        makeSlot('slot-a', T(14), T(14, 50)),
        makeSlot('slot-b', T(14, 50), T(15, 40)),
      ]);
      blockSlotMock.mockResolvedValue(undefined);

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15, 40),
      });

      expect(blockSlotMock).toHaveBeenCalledTimes(2);
      expect(blockSlotMock).toHaveBeenCalledWith('slot-a', 'GOOGLE');
      expect(blockSlotMock).toHaveBeenCalledWith('slot-b', 'GOOGLE');
      expect(resultado.bloqueados).toEqual(['slot-a', 'slot-b']);
      expect(resultado.liberados).toEqual([]);
      expect(resultado.conflitos).toEqual([]);
      expect(resultado.intervaloId).toBe('int-1');
    });

    it('absorve AVAILABILITY_050 em jaCoerentes sem propagar', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(new AppError('AVAILABILITY_050', 'Slot já está bloqueado.', 409));

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });

      expect(resultado.jaCoerentes).toEqual(['slot-a']);
      expect(resultado.bloqueados).toEqual([]);
      expect(resultado.conflitos).toEqual([]);
    });

    it('registra AVAILABILITY_051 sem sessionId em conflitos, sem persistir nem notificar', async () => {
      // Erro vindo de caminho antigo (sem `details.sessionId`): continua
      // contabilizado em memoria com warning, nunca engolido nem persistido.
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_051', 'Não é possível bloquear slot com sessão ativa.', 409),
      );

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });
      expect(blockSlotMock).toHaveBeenCalledTimes(1);
      expect(resultado.conflitos).toEqual([
        { slotId: 'slot-a', motivo: 'SESSAO_VIVA', conflictId: undefined, sessionId: undefined },
      ]);
      expect(resultado.bloqueados).toEqual([]);
      expect(mockConflitos.openConflict).not.toHaveBeenCalled();
      expect(mockEmail.send).not.toHaveBeenCalled();
    });

    it('conflito com sessao ativa: persiste, notifica uma vez e nao escreve na sessao', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_051', 'Não é possível bloquear slot com sessão ativa.', 409, {
          sessionId: 'sess-1',
        }),
      );
      mockConflitos.openConflict.mockResolvedValue({
        conflito: {
          id: 'conf-1',
          intervalId: 'int-1',
          slotId: 'slot-a',
          sessionId: 'sess-1',
          detectedAt: T(10),
          notifiedAt: null,
        },
        criado: true,
      });

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });
      expect(mockConflitos.openConflict).toHaveBeenCalledWith({
        intervalId: 'int-1',
        slotId: 'slot-a',
        sessionId: 'sess-1',
      });
      expect(mockEmail.send).toHaveBeenCalledTimes(1);
      expect(mockEmail.send.mock.calls[0][0]).toMatchObject({
        to: 'professor@corgly.test',
        type: 'EXTERNAL_BUSY_CONFLICT',
        data: { sessionId: 'sess-1' },
        locale: 'PT_BR',
        idempotencyKey: `external-busy-conflict/conf-1/${T(10).getTime()}`,
      });
      expect(mockConflitos.claimNotification).toHaveBeenCalledWith(
        'conf-1',
        expect.any(String),
      );
      const claimId = mockConflitos.claimNotification.mock.calls[0][1];
      expect(mockConflitos.markNotified).toHaveBeenCalledWith('conf-1', claimId);
      expect(resultado.conflitos).toEqual([
        { slotId: 'slot-a', motivo: 'SESSAO_VIVA', conflictId: 'conf-1', sessionId: 'sess-1' },
      ]);
      expect(resultado.bloqueados).toEqual([]);
      // F8: a aula vendida nao e tocada por nenhum caminho de escrita.
      expect(mockPrisma.session.update).not.toHaveBeenCalled();
      expect(mockPrisma.session.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.session.delete).not.toHaveBeenCalled();
    });

    it('re-sync do mesmo conflito nao re-notifica (idempotencia do @@unique)', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_051', 'Não é possível bloquear slot com sessão ativa.', 409, {
          sessionId: 'sess-1',
        }),
      );
      // Linha ja aberta: `criado: false` e exatamente o sinal de "nao avisar de novo".
      mockConflitos.openConflict.mockResolvedValue({
        conflito: {
          id: 'conf-1',
          intervalId: 'int-1',
          slotId: 'slot-a',
          sessionId: 'sess-1',
          detectedAt: T(10),
          notifiedAt: T(11),
        },
        criado: false,
      });

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });
      expect(mockConflitos.openConflict).toHaveBeenCalledTimes(1);
      expect(mockConflitos.claimNotification).not.toHaveBeenCalled();
      expect(mockEmail.send).not.toHaveBeenCalled();
      expect(mockConflitos.markNotified).not.toHaveBeenCalled();
      expect(resultado.conflitos[0].conflictId).toBe('conf-1');
    });

    it('falha de email nao derruba a sincronizacao e deixa notifiedAt por carimbar', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_051', 'Não é possível bloquear slot com sessão ativa.', 409, {
          sessionId: 'sess-1',
        }),
      );
      mockConflitos.openConflict.mockResolvedValue({
        conflito: {
          id: 'conf-1',
          intervalId: 'int-1',
          slotId: 'slot-a',
          sessionId: 'sess-1',
          detectedAt: T(10),
          notifiedAt: null,
        },
        criado: true,
      });
      mockEmail.send.mockRejectedValue(new Error('SMTP fora do ar'));

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });
      // O conflito continua registrado no resultado e no ledger...
      expect(resultado.conflitos[0].conflictId).toBe('conf-1');
      expect(mockEmail.send).toHaveBeenCalledTimes(1);
      // ...e `notifiedAt` segue NULL, mantendo o conflito elegivel para aviso
      // numa passada futura.
      expect(mockConflitos.markNotified).not.toHaveBeenCalled();
      expect(mockConflitos.releaseNotificationClaim).toHaveBeenCalledWith(
        'conf-1',
        expect.any(String),
        'SMTP fora do ar',
      );
    });

    it('re-sync recupera aviso pendente mesmo quando o conflito nao foi criado nesta passada', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_051', 'Não é possível bloquear slot com sessão ativa.', 409, {
          sessionId: 'sess-1',
        }),
      );
      mockConflitos.openConflict.mockResolvedValue({
        conflito: {
          id: 'conf-pendente',
          intervalId: 'int-1',
          slotId: 'slot-a',
          sessionId: 'sess-1',
          detectedAt: T(10),
          notifiedAt: null,
        },
        criado: false,
      });

      await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });

      expect(mockConflitos.claimNotification).toHaveBeenCalledTimes(1);
      expect(mockEmail.send).toHaveBeenCalledTimes(1);
      expect(mockConflitos.markNotified).toHaveBeenCalledTimes(1);
    });

    it('claim ja adquirido por outra execucao impede email concorrente', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_051', 'Não é possível bloquear slot com sessão ativa.', 409, {
          sessionId: 'sess-1',
        }),
      );
      mockConflitos.openConflict.mockResolvedValue({
        conflito: {
          id: 'conf-1',
          intervalId: 'int-1',
          slotId: 'slot-a',
          sessionId: 'sess-1',
          detectedAt: T(10),
          notifiedAt: null,
        },
        criado: false,
      });
      mockConflitos.claimNotification.mockResolvedValue(false);

      await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });

      expect(mockEmail.send).not.toHaveBeenCalled();
      expect(mockConflitos.markNotified).not.toHaveBeenCalled();
    });

    it('ausencia de ADMIN libera o claim para tentativa futura', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_051', 'Não é possível bloquear slot com sessão ativa.', 409, {
          sessionId: 'sess-1',
        }),
      );
      mockConflitos.openConflict.mockResolvedValue({
        conflito: {
          id: 'conf-1',
          intervalId: 'int-1',
          slotId: 'slot-a',
          sessionId: 'sess-1',
          detectedAt: T(10),
          notifiedAt: null,
        },
        criado: true,
      });

      await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });

      expect(mockEmail.send).not.toHaveBeenCalled();
      expect(mockConflitos.releaseNotificationClaim).toHaveBeenCalledWith(
        'conf-1',
        expect.any(String),
        'ADMIN_NOT_FOUND',
      );
    });

    it('sessao cancelada: bloqueio passa a valer e o conflito do slot e resolvido', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockResolvedValue(undefined);
      mockConflitos.resolveBySlot.mockResolvedValue(1);

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(14),
        endAt: T(15),
      });

      expect(resultado.bloqueados).toEqual(['slot-a']);
      expect(mockConflitos.resolveBySlot).toHaveBeenCalledWith('slot-a');
      expect(mockConflitos.openConflict).not.toHaveBeenCalled();
    });

    it('propaga AVAILABILITY_053 ao chamador sem retry local', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_053', 'Conflito de concorrência no slot. Tente novamente.', 409),
      );

      const erro = await service
        .recordBusy({ externalEventId: 'evt-1', startAt: T(14), endAt: T(15) })
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(AppError);
      expect((erro as AppError).code).toBe('AVAILABILITY_053');
      expect(blockSlotMock).toHaveBeenCalledTimes(1);
    });

    it('propaga AVAILABILITY_054 ao chamador sem retry local', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(makeIntervalo());
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([makeSlot('slot-a', T(14), T(14, 50))]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_054', 'Slot em disputa no momento. Tente novamente.', 409),
      );

      await expect(
        service.recordBusy({ externalEventId: 'evt-1', startAt: T(14), endAt: T(15) }),
      ).rejects.toMatchObject({ code: 'AVAILABILITY_054' });
    });

    it('ordem travada: falha no laco novo propaga E a faixa antiga ja foi reconciliada', async () => {
      // Evento ja gravado das 14h as 15h; a chamada move para 16h-17h.
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(makeIntervalo());
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(
        makeIntervalo({ startAt: T(16), endAt: T(17) }),
      );
      // Primeira consulta: slots da FAIXA ANTIGA (14h-15h). Segunda: da nova.
      mockPrisma.availabilitySlot.findMany
        .mockResolvedValueOnce([makeSlot('slot-14', T(14), T(14, 50), 'GOOGLE')])
        .mockResolvedValueOnce([makeSlot('slot-16', T(16), T(16, 50))]);
      // Nenhuma outra ocupacao vigente cobre o slot da faixa antiga.
      mockPrisma.externalBusyInterval.findMany.mockResolvedValue([]);
      blockSlotMock.mockRejectedValue(
        new AppError('AVAILABILITY_054', 'Slot em disputa no momento. Tente novamente.', 409),
      );
      unblockSlotMock.mockResolvedValue(undefined);

      await expect(
        service.recordBusy({ externalEventId: 'evt-1', startAt: T(16), endAt: T(17) }),
      ).rejects.toMatchObject({ code: 'AVAILABILITY_054' });

      // A reconciliacao da faixa antiga veio ANTES do laco de bloqueio: sem
      // este assert, uma implementacao que reconcilia depois reintroduz o
      // estado irrecuperavel descrito no residuo do item 016.
      expect(unblockSlotMock).toHaveBeenCalledWith('slot-14', 'GOOGLE');
      expect(mockConflitos.resolveOutsideWindow).toHaveBeenCalledWith(
        'int-1',
        { startAt: T(16), endAt: T(17) },
      );
    });

    it('move a janela: libera o slot da faixa antiga e bloqueia o da nova', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(makeIntervalo());
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(
        makeIntervalo({ startAt: T(16), endAt: T(17) }),
      );
      mockPrisma.availabilitySlot.findMany
        .mockResolvedValueOnce([makeSlot('slot-14', T(14), T(14, 50), 'GOOGLE')])
        .mockResolvedValueOnce([makeSlot('slot-16', T(16), T(16, 50))]);
      mockPrisma.externalBusyInterval.findMany.mockResolvedValue([]);
      blockSlotMock.mockResolvedValue(undefined);
      unblockSlotMock.mockResolvedValue(undefined);

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(16),
        endAt: T(17),
      });

      expect(unblockSlotMock).toHaveBeenCalledWith('slot-14', 'GOOGLE');
      expect(blockSlotMock).toHaveBeenCalledWith('slot-16', 'GOOGLE');
      expect(resultado.liberados).toEqual(['slot-14']);
      expect(resultado.bloqueados).toEqual(['slot-16']);
      expect(mockConflitos.resolveOutsideWindow).toHaveBeenCalledWith(
        'int-1',
        { startAt: T(16), endAt: T(17) },
      );
    });

    it('move a janela mas preserva o slot da faixa antiga coberto por outra ocupacao vigente', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(makeIntervalo());
      mockPrisma.externalBusyInterval.upsert.mockResolvedValue(
        makeIntervalo({ startAt: T(16), endAt: T(17) }),
      );
      mockPrisma.availabilitySlot.findMany
        .mockResolvedValueOnce([makeSlot('slot-14', T(14), T(14, 50), 'GOOGLE')])
        .mockResolvedValueOnce([]);
      // Outra ocupacao vigente ainda cobre o slot das 14h.
      mockPrisma.externalBusyInterval.findMany.mockResolvedValue([
        makeIntervalo({ id: 'int-2', externalEventId: 'evt-2' }),
      ]);
      unblockSlotMock.mockResolvedValue(undefined);

      const resultado = await service.recordBusy({
        externalEventId: 'evt-1',
        startAt: T(16),
        endAt: T(17),
      });

      expect(unblockSlotMock).not.toHaveBeenCalled();
      expect(resultado.liberados).toEqual([]);
      expect(resultado.jaCoerentes).toEqual(['slot-14']);
    });
  });

  describe('revokeBusy', () => {
    it('id desconhecido devolve resultado vazio com intervaloId null, sem lancar e sem unblockSlot', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(null);

      const resultado = await service.revokeBusy('evt-inexistente');

      expect(resultado).toEqual({
        intervaloId: null,
        bloqueados: [],
        liberados: [],
        jaCoerentes: [],
        conflitos: [],
      });
      expect(mockPrisma.externalBusyInterval.updateMany).not.toHaveBeenCalled();
      expect(unblockSlotMock).not.toHaveBeenCalled();
    });

    it('linha ja revogada (count 0) reprojeta assim mesmo e libera o slot deixado bloqueado', async () => {
      // Cena: chamada anterior revogou a linha e morreu no meio da projecao.
      // updateMany devolve count 0 porque revokedAt ja estava carimbado.
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(
        makeIntervalo({ revokedAt: T(12) }),
      );
      mockPrisma.externalBusyInterval.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([
        makeSlot('slot-a', T(14), T(14, 50), 'GOOGLE'),
      ]);
      mockPrisma.externalBusyInterval.findMany.mockResolvedValue([]);
      unblockSlotMock.mockResolvedValue(undefined);

      const resultado = await service.revokeBusy('evt-1');

      expect(unblockSlotMock).toHaveBeenCalledWith('slot-a', 'GOOGLE');
      expect(resultado.liberados).toEqual(['slot-a']);
      expect(resultado.intervaloId).toBe('int-1');
    });

    it('fecha os conflitos abertos da ocupacao revogada', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(makeIntervalo());
      mockPrisma.externalBusyInterval.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([]);
      mockConflitos.resolveByInterval.mockResolvedValue(1);

      await service.revokeBusy('evt-1');

      // O compromisso sumiu da agenda de origem: nao ha mais com o que colidir.
      expect(mockConflitos.resolveByInterval).toHaveBeenCalledWith('int-1');
    });

    it('libera o slot sem outra cobertura e preserva o slot ainda coberto por outra ocupacao vigente', async () => {
      mockPrisma.externalBusyInterval.findUnique.mockResolvedValue(makeIntervalo());
      mockPrisma.externalBusyInterval.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.availabilitySlot.findMany.mockResolvedValue([
        makeSlot('slot-a', T(14), T(14, 50), 'GOOGLE'),
        makeSlot('slot-b', T(14), T(14, 50), 'BOTH'),
      ]);
      // Duas consultas de cobertura (uma por slot): slot-a sem cobertura,
      // slot-b ainda coberto por outro evento.
      mockPrisma.externalBusyInterval.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeIntervalo({ id: 'int-2', externalEventId: 'evt-2' })]);
      unblockSlotMock.mockResolvedValue(undefined);

      const resultado = await service.revokeBusy('evt-1');

      expect(unblockSlotMock).toHaveBeenCalledTimes(1);
      expect(unblockSlotMock).toHaveBeenCalledWith('slot-a', 'GOOGLE');
      expect(resultado.liberados).toEqual(['slot-a']);
      expect(resultado.jaCoerentes).toEqual(['slot-b']);
    });
  });

  describe('cobre', () => {
    it('recusa contato de borda nos dois sentidos', () => {
      // Slot terminando exatamente quando a ocupacao comeca.
      expect(cobre({ startAt: T(10), endAt: T(10, 50) }, { startAt: T(10, 50), endAt: T(11, 30) })).toBe(false);
      // Slot comecando exatamente quando a ocupacao termina.
      expect(cobre({ startAt: T(11, 30), endAt: T(12, 20) }, { startAt: T(10, 50), endAt: T(11, 30) })).toBe(false);
      // Sobreposicao real cobre nos dois alinhamentos.
      expect(cobre({ startAt: T(10), endAt: T(10, 50) }, { startAt: T(10, 30), endAt: T(11, 30) })).toBe(true);
      expect(cobre({ startAt: T(10, 30), endAt: T(11, 30) }, { startAt: T(10), endAt: T(10, 50) })).toBe(true);
    });
  });
});
