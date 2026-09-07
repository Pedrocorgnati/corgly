// @vitest-environment node
/**
 * ST002 — bulkCancel() atomicidade com $transaction
 * Nota: session.service.test.ts usa Jest API (migração pendente em module-9/TASK-6).
 * Estes testes usam Vitest vi.* conforme TASK-8 ST002.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionService } from '../session.service';
import { BulkCancelSchema } from '@/schemas/session.schema';
import { SLOT_OCCUPYING_STATUSES } from '@/services/availability.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTransactionClient = vi.hoisted(() => ({
  session: { update: vi.fn() },
  creditBatch: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

const mockPrisma = vi.hoisted(() => ({
  session: { findMany: vi.fn(), count: vi.fn() },
  availabilitySlot: { updateMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const mockCreditService = vi.hoisted(() => ({
  consume: vi.fn(),
  refund: vi.fn(),
  refundWithTx: vi.fn(),
  getBalance: vi.fn(),
}));

vi.mock('@/services/credit.service', () => ({
  creditService: mockCreditService,
}));

vi.mock('@/services/email.service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    studentId: `student-${id}`,
    creditBatchId: `batch-${id}`,
    status: 'SCHEDULED',
    startAt: new Date('2026-04-01T14:00:00Z'),
    endAt: new Date('2026-04-01T14:50:00Z'),
    student: { email: `student@test.com`, preferredLanguage: 'PT_BR' },
    ...overrides,
  };
}

describe('SessionService — bulkCancel() $transaction atomicidade (ST002)', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
    vi.clearAllMocks();

    // Default: $transaction executes the callback with the transaction client
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTransactionClient) => Promise<unknown>) => {
      return fn(mockTransactionClient);
    });

    // Default: session.update and refundWithTx succeed
    mockTransactionClient.session.update.mockResolvedValue(makeSession('s1'));
    mockCreditService.refundWithTx.mockResolvedValue(undefined);

    // Default: nenhum slot bloqueado (item 007) — sem isto os testes acima
    // quebram ao chamar updateMany em `undefined`.
    mockPrisma.availabilitySlot.updateMany.mockResolvedValue({ count: 0 });
  });

  it('deve cancelar todas as sessões quando refund e update têm sucesso em todas', async () => {
    const sessions = [makeSession('s1'), makeSession('s2'), makeSession('s3')];
    mockPrisma.session.findMany.mockResolvedValue(sessions);

    const result = await service.bulkCancel({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      reason: 'Férias',
    });

    expect(result.cancelled).toBe(3);
    expect(result.refunded).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('deve preservar sessões não canceladas quando refundWithTx falha em uma', async () => {
    const sessions = [makeSession('s1'), makeSession('s2'), makeSession('s3')];
    mockPrisma.session.findMany.mockResolvedValue(sessions);

    // s2 fails: refundWithTx throws → $transaction rolls back for s2
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTransactionClient) => Promise<unknown>) => {
      const sessionId = mockTransactionClient.session.update.mock.calls.length;
      // Fail on second invocation (index 1 = s2)
      if (mockPrisma.$transaction.mock.calls.length === 2) {
        throw new Error('Stripe timeout');
      }
      return fn(mockTransactionClient);
    });

    const result = await service.bulkCancel({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      reason: 'Férias',
    });

    // s1 and s3 cancelled, s2 failed
    expect(result.cancelled).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].sessionId).toBe('s2');
  });

  it('deve retornar erros parciais sem lançar exceção global', async () => {
    const sessions = [makeSession('s1'), makeSession('s2')];
    mockPrisma.session.findMany.mockResolvedValue(sessions);

    // Both transactions fail
    mockPrisma.$transaction.mockRejectedValue(new Error('DB connection lost'));

    const result = await service.bulkCancel({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      reason: 'Manutenção',
    });

    // Should NOT throw — returns error list
    expect(result.cancelled).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].error).not.toContain('password');
    expect(result.errors[0].error).not.toContain('secret');
  });

  it('deve invocar $transaction por sessão (uma transação por unidade)', async () => {
    const sessions = [makeSession('s1'), makeSession('s2')];
    mockPrisma.session.findMany.mockResolvedValue(sessions);

    await service.bulkCancel({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      reason: 'Teste',
    });

    // Each session gets its own $transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('deve incluir succeeded/errors/total no retorno', async () => {
    const sessions = [makeSession('s1')];
    mockPrisma.session.findMany.mockResolvedValue(sessions);

    const result = await service.bulkCancel({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      reason: 'Test',
    });

    expect(result).toHaveProperty('cancelled');
    expect(result).toHaveProperty('refunded');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

describe('SessionService — bulkCancel() bloqueia os horarios do periodo (item 007)', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
    vi.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTransactionClient) => Promise<unknown>) => {
      return fn(mockTransactionClient);
    });
    mockTransactionClient.session.update.mockResolvedValue(makeSession('s1'));
    mockCreditService.refundWithTx.mockResolvedValue(undefined);
    mockPrisma.availabilitySlot.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.session.findMany.mockResolvedValue([]);
  });

  // C7.1 — contrato de data: o modal envia YYYY-MM-DD (BulkBlockModal linhas 106/120)
  it('deve aceitar YYYY-MM-DD no BulkCancelSchema sem deixar de aceitar ISO completo', () => {
    expect(
      BulkCancelSchema.safeParse({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' }).success,
    ).toBe(true);

    expect(
      BulkCancelSchema.safeParse({
        startDate: '2026-04-01T00:00:00.000Z',
        endDate: '2026-04-30T23:59:59.999Z',
        reason: 'Ferias',
      }).success,
    ).toBe(true);

    expect(BulkCancelSchema.safeParse({ startDate: '01/04/2026', endDate: '2026-04-30' }).success).toBe(false);
    expect(BulkCancelSchema.safeParse({ startDate: 'abril', endDate: '2026-04-30' }).success).toBe(false);
    expect(BulkCancelSchema.safeParse({ startDate: '', endDate: '2026-04-30' }).success).toBe(false);
  });

  // C7.2 — janela inclusiva: o ultimo dia inteiro entra na varredura
  it('deve fechar a janela no fim do ultimo dia quando as datas vem sem hora', async () => {
    await service.bulkCancel({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' });

    const where = mockPrisma.session.findMany.mock.calls[0][0].where;
    expect(where.startAt.gte.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(where.startAt.lte.toISOString()).toBe('2026-04-30T23:59:59.999Z');
  });

  // C7.3 — efeito real: o periodo fica bloqueado, com bump de version (CAS do CronService)
  it('deve bloquear os slots do periodo em uma unica escrita agregada com bump de version', async () => {
    await service.bulkCancel({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' });

    expect(mockPrisma.availabilitySlot.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.availabilitySlot.updateMany.mock.calls[0][0];
    expect(arg.data.isBlocked).toBe(true);
    expect(arg.data.version).toEqual({ increment: 1 });
    expect(arg.where.startAt.gte.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(arg.where.startAt.lte.toISOString()).toBe('2026-04-30T23:59:59.999Z');
  });

  // C7.4 — invariante que blockSlot defende com AVAILABILITY_051: slot ocupado nao vira bloqueado
  it('deve preservar slot ocupado, filtrando por sessions none nos status ocupantes', async () => {
    await service.bulkCancel({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' });

    const where = mockPrisma.availabilitySlot.updateMany.mock.calls[0][0].where;
    expect(where.isBlocked).toBe(false);
    expect(where.sessions).toEqual({ none: { status: { in: [...SLOT_OCCUPYING_STATUSES] } } });
  });

  // C7.5 — contador propagado ao chamador
  it('deve devolver em blocked a contagem retornada pelo updateMany', async () => {
    mockPrisma.availabilitySlot.updateMany.mockResolvedValue({ count: 12 });

    const result = await service.bulkCancel({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' });

    expect(result.blocked).toBe(12);
  });

  // C7.6 — ordem: bloquear DEPOIS de cancelar, senao a sessao recem-cancelada ainda ocupa o slot
  it('deve bloquear apenas depois de fechar a ultima transacao de cancelamento', async () => {
    mockPrisma.session.findMany.mockResolvedValue([makeSession('s1'), makeSession('s2')]);

    await service.bulkCancel({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' });

    const txOrder = mockPrisma.$transaction.mock.invocationCallOrder;
    const blockOrder = mockPrisma.availabilitySlot.updateMany.mock.invocationCallOrder;
    expect(txOrder.length).toBe(2);
    expect(blockOrder.length).toBe(1);
    expect(blockOrder[0]).toBeGreaterThan(txOrder[txOrder.length - 1]);
  });
});

describe('SessionService — bulkCancelPreview() (item 008)', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
    vi.clearAllMocks();

    // A previa usa a forma de ARRAY do $transaction (duas leituras em lote), nao
    // a forma de callback que o bulkCancel usa por sessao.
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof mockTransactionClient) => Promise<unknown>)(mockTransactionClient),
    );

    mockPrisma.session.count.mockResolvedValue(0);
    mockPrisma.availabilitySlot.count.mockResolvedValue(0);
    mockPrisma.availabilitySlot.updateMany.mockResolvedValue({ count: 0 });
  });

  // C8.1 — janela date-only fecha no fim do ultimo dia (mesmo helper do bulkCancel)
  it('deve fechar a janela date-only no fim do ultimo dia', async () => {
    await service.bulkCancelPreview({ startDate: '2026-04-01', endDate: '2026-04-30' });

    const where = mockPrisma.session.count.mock.calls[0][0].where;
    expect(where.startAt.gte.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(where.startAt.lte.toISOString()).toBe('2026-04-30T23:59:59.999Z');
  });

  // C8.2 — paridade de predicado de sessao com o findMany da execucao
  it('deve contar sessoes com o mesmo predicado que bulkCancel usa no findMany', async () => {
    mockPrisma.session.findMany.mockResolvedValue([]);

    await service.bulkCancelPreview({ startDate: '2026-04-01', endDate: '2026-04-30' });
    await service.bulkCancel({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' });

    const previewWhere = mockPrisma.session.count.mock.calls[0][0].where;
    const execWhere = mockPrisma.session.findMany.mock.calls[0][0].where;
    expect(previewWhere).toEqual(execWhere);
    expect(previewWhere.status).toBe('SCHEDULED');
  });

  // C8.3 — paridade de predicado de slot com o updateMany da execucao
  it('deve contar slots com o mesmo predicado que bulkCancel usa no updateMany', async () => {
    mockPrisma.session.findMany.mockResolvedValue([]);

    await service.bulkCancelPreview({ startDate: '2026-04-01', endDate: '2026-04-30' });
    await service.bulkCancel({ startDate: '2026-04-01', endDate: '2026-04-30', reason: 'Ferias' });

    const previewWhere = mockPrisma.availabilitySlot.count.mock.calls[0][0].where;
    const execWhere = mockPrisma.availabilitySlot.updateMany.mock.calls[0][0].where;
    expect(previewWhere).toEqual(execWhere);
    expect(previewWhere.isBlocked).toBe(false);
    expect(previewWhere.sessions).toEqual({ none: { status: { in: [...SLOT_OCCUPYING_STATUSES] } } });
  });

  // C8.4 — os dois counts saem projetados nas chaves que o modal consome
  it('deve projetar os dois counts em sessionsToCancel e slotsToBlock', async () => {
    mockPrisma.session.count.mockResolvedValue(7);
    mockPrisma.availabilitySlot.count.mockResolvedValue(12);

    const result = await service.bulkCancelPreview({ startDate: '2026-04-01', endDate: '2026-04-30' });

    expect(result).toEqual({ sessionsToCancel: 7, slotsToBlock: 12 });
  });

  // C8.5 — previa nao escreve: nenhum update, nenhum $transaction com callback
  it('nao deve escrever nada no banco', async () => {
    await service.bulkCancelPreview({ startDate: '2026-04-01', endDate: '2026-04-30' });

    expect(mockTransactionClient.session.update).not.toHaveBeenCalled();
    expect(mockPrisma.availabilitySlot.updateMany).not.toHaveBeenCalled();
    const callbackCalls = mockPrisma.$transaction.mock.calls.filter(
      ([arg]: [unknown]) => typeof arg === 'function',
    );
    expect(callbackCalls).toHaveLength(0);
  });
});
