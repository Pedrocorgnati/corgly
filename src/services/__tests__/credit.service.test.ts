// @vitest-environment node
import { CreditService } from '../credit.service';
import { AppError } from '@/lib/errors';

// vi.hoisted: garante que os mocks são definidos antes do hoist do vi.mock
const mocks = vi.hoisted(() => {
  const mockQueryRaw = vi.fn();
  const mockExecuteRaw = vi.fn();
  const mockTransaction = vi.fn();
  const mockCreditBatchCreate = vi.fn();
  const mockCreditBatchUpdate = vi.fn();
  const mockCreditBatchFindFirst = vi.fn();

  return {
    mockQueryRaw,
    mockExecuteRaw,
    mockTransaction,
    mockCreditBatchCreate,
    mockCreditBatchUpdate,
    mockCreditBatchFindFirst,
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.mockQueryRaw,
    $executeRaw: mocks.mockExecuteRaw,
    $transaction: mocks.mockTransaction,
    creditBatch: {
      create: mocks.mockCreditBatchCreate,
      update: mocks.mockCreditBatchUpdate,
      findFirst: mocks.mockCreditBatchFindFirst,
    },
  },
}));

function makeBatch(
  overrides?: Partial<{ id: string; totalCredits: number; usedCredits: number; expiresAt: Date | null }>,
) {
  return {
    id: 'batch-1',
    totalCredits: 5,
    usedCredits: 0,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe('CreditService', () => {
  let service: CreditService;

  beforeEach(() => {
    service = new CreditService();
    vi.clearAllMocks();
  });

  // ─── getBalance ────────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('retorna total de créditos válidos como number', async () => {
      mocks.mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(8) }]);
      const result = await service.getBalance('user-1');
      expect(result).toBe(8);
    });

    it('retorna 0 quando não há batches', async () => {
      mocks.mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(0) }]);
      const result = await service.getBalance('user-1');
      expect(result).toBe(0);
    });
  });

  // ─── getBreakdown ──────────────────────────────────────────────────────────

  describe('getBreakdown', () => {
    it('ordena expiresAt ASC com nulls por último e calcula remaining', async () => {
      const now = new Date();
      const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const later = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      mocks.mockQueryRaw.mockResolvedValueOnce([
        { id: 'b1', type: 'PACK_5', totalCredits: 5, usedCredits: 2, expiresAt: soon, createdAt: now },
        { id: 'b2', type: 'SINGLE', totalCredits: 1, usedCredits: 0, expiresAt: later, createdAt: now },
        { id: 'b3', type: 'MONTHLY', totalCredits: 4, usedCredits: 0, expiresAt: null, createdAt: now },
      ]);

      const result = await service.getBreakdown('user-1');
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('b1');
      expect(result[1].id).toBe('b2');
      expect(result[2].id).toBe('b3'); // null last
      expect(result[0].remaining).toBe(3); // 5 - 2
    });

    it('retorna lista vazia quando não há batches ativos', async () => {
      mocks.mockQueryRaw.mockResolvedValueOnce([]);
      const result = await service.getBreakdown('user-1');
      expect(result).toEqual([]);
    });
  });

  // ─── consume FEFO ──────────────────────────────────────────────────────────

  describe('consume FEFO', () => {
    // Caso 1: 1 batch suficiente
    it('caso 1: consume de 1 batch suficiente — retorna batchId correto', async () => {
      mocks.mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const fakeTx = {
            $queryRaw: vi.fn().mockResolvedValue([makeBatch({ id: 'A', totalCredits: 5, usedCredits: 0 })]),
            $executeRaw: vi.fn().mockResolvedValue(1),
          };
          return fn(fakeTx);
        },
      );

      const result = await service.consume('user-1', 3);
      expect(result).toEqual({ consumed: 3, batchIds: ['A'] });
    });

    // Caso 2: múltiplos batches — FEFO
    it('caso 2: consume múltiplos batches na ordem FEFO (exp mais próxima primeiro)', async () => {
      mocks.mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const fakeTx = {
            $queryRaw: vi.fn().mockResolvedValue([
              makeBatch({ id: 'A', totalCredits: 2, usedCredits: 0 }),
              makeBatch({ id: 'B', totalCredits: 5, usedCredits: 0 }),
            ]),
            $executeRaw: vi.fn().mockResolvedValue(1),
          };
          return fn(fakeTx);
        },
      );

      const result = await service.consume('user-1', 4);
      expect(result).not.toBeNull();
      expect(result!.consumed).toBe(4);
      expect(result!.batchIds).toEqual(['A', 'B']);
    });

    // Caso 3: batch expirado ignorado (não retornado pelo SQL)
    it('caso 3: batch expirado ignorado — consome apenas do batch válido', async () => {
      mocks.mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          // SQL já filtra expirados — fakeTx só retorna o batch válido Y
          const fakeTx = {
            $queryRaw: vi.fn().mockResolvedValue([makeBatch({ id: 'Y', totalCredits: 5, usedCredits: 0 })]),
            $executeRaw: vi.fn().mockResolvedValue(1),
          };
          return fn(fakeTx);
        },
      );

      const result = await service.consume('user-1', 3);
      expect(result).not.toBeNull();
      expect(result!.batchIds).toEqual(['Y']);
    });

    // Caso 4: saldo insuficiente → null + rollback automático do Prisma
    it('caso 4: saldo insuficiente → retorna null (rollback transacional)', async () => {
      // Simula throw do AppError CREDIT_050 dentro da transação (Prisma faz rollback)
      mocks.mockTransaction.mockRejectedValueOnce(
        new AppError('CREDIT_050', 'Saldo de créditos insuficiente.', 400),
      );

      const result = await service.consume('user-1', 10);
      expect(result).toBeNull();
    });

    // Caso adicional: qty = 0
    it('qty = 0 → retorna { consumed: 0, batchIds: [] } sem query ao banco', async () => {
      const result = await service.consume('user-1', 0);
      expect(result).toEqual({ consumed: 0, batchIds: [] });
      expect(mocks.mockTransaction).not.toHaveBeenCalled();
    });

    // Caso adicional: qty negativo
    it('qty negativo → lança AppError VAL_003', async () => {
      await expect(service.consume('user-1', -1)).rejects.toMatchObject({ code: 'VAL_003' });
    });
  });

  // ─── refund ───────────────────────────────────────────────────────────────

  describe('refund', () => {
    // Caso 5: refund retorna crédito ao batch original
    it('caso 5: refund ao batch original (creditBatchId fornecido) — usedCredits decrementado', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});
      mocks.mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const fakeTx = {
            creditBatch: {
              findFirst: vi.fn().mockResolvedValue(makeBatch({ id: 'A', usedCredits: 3 })),
              update: mockUpdate,
              create: vi.fn(),
            },
          };
          return fn(fakeTx);
        },
      );

      await service.refund('user-1', 2, 'A');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { usedCredits: { decrement: 2 } } }),
      );
    });

    it('sem creditBatchId: cria batch REFUND sem expiração', async () => {
      const mockCreate = vi.fn().mockResolvedValue({});
      mocks.mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const fakeTx = {
            creditBatch: {
              findFirst: vi.fn(),
              update: vi.fn(),
              create: mockCreate,
            },
          };
          return fn(fakeTx);
        },
      );

      await service.refund('user-1', 3);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'REFUND', totalCredits: 3, expiresAt: null }),
        }),
      );
    });

    it('refund não negativar usedCredits — usa Math.min(qty, batch.usedCredits)', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({});
      mocks.mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const fakeTx = {
            creditBatch: {
              findFirst: vi.fn().mockResolvedValue(makeBatch({ id: 'A', usedCredits: 1 })),
              update: mockUpdate,
              create: vi.fn(),
            },
          };
          return fn(fakeTx);
        },
      );

      // Tentativa de refund de 5, mas usedCredits = 1 → decrement deve ser 1 (não 5)
      await service.refund('user-1', 5, 'A');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { usedCredits: { decrement: 1 } } }),
      );
    });
  });

  // ─── addManualCredits ─────────────────────────────────────────────────────

  describe('addManualCredits', () => {
    it('reason < 10 chars → lança AppError CREDIT_052', async () => {
      await expect(
        service.addManualCredits({ userId: 'u1', credits: 5, reason: 'curto' }),
      ).rejects.toMatchObject({ code: 'CREDIT_052' });
    });

    it('credits positivo: cria batch MANUAL com reason e retorna newBalance', async () => {
      mocks.mockCreditBatchCreate.mockResolvedValueOnce({});
      mocks.mockQueryRaw.mockResolvedValueOnce([{ total: BigInt(5) }]);

      const result = await service.addManualCredits({
        userId: 'u1',
        credits: 5,
        reason: 'Bônus de boas-vindas ao aluno novo',
      });

      expect(mocks.mockCreditBatchCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'MANUAL', totalCredits: 5 }),
        }),
      );
      expect(result.newBalance).toBe(5);
    });
  });
});
