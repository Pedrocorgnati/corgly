// @vitest-environment node
/**
 * ST002 — bulkCancel() atomicidade com $transaction
 * Nota: session.service.test.ts usa Jest API (migração pendente em module-9/TASK-6).
 * Estes testes usam Vitest vi.* conforme TASK-8 ST002.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionService } from '../session.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTransactionClient = vi.hoisted(() => ({
  session: { update: vi.fn() },
  creditBatch: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

const mockPrisma = vi.hoisted(() => ({
  session: { findMany: vi.fn() },
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
