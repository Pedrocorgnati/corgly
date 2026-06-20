// @vitest-environment node
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreditConsumptionService } from '@/lib/credits/credit-consumption.service';

type Batch = {
  id: string;
  totalCredits: number;
  usedCredits: number;
};

const prismaMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: prismaMocks.transaction,
  },
}));

function createLedger(batches: Batch[]) {
  return {
    listConsumableBatchesForUpdate: vi.fn(async () =>
      batches
        .filter((batch) => batch.usedCredits < batch.totalCredits)
        .map((batch) => ({ ...batch })),
    ),
    consumeFromBatch: vi.fn(async (_tx: unknown, batchId: string, quantity: number) => {
      const batch = batches.find((candidate) => candidate.id === batchId);
      if (!batch || batch.usedCredits + quantity > batch.totalCredits) {
        throw new Error('saldo negativo bloqueado');
      }
      batch.usedCredits += quantity;
    }),
  };
}

function createSerializableTransaction() {
  let queue = Promise.resolve();

  return vi.fn(async (fn: (tx: unknown) => Promise<unknown>, options?: { isolationLevel?: string }) => {
    expect(options?.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);

    const run = queue.then(() => fn({}));
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  });
}

describe('FEFO atomic credit consumption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consome primeiro o batch com expiração mais próxima conforme ordem FEFO bloqueada', async () => {
    const batches = [
      { id: 'expires-soon', totalCredits: 1, usedCredits: 0 },
      { id: 'expires-later', totalCredits: 2, usedCredits: 0 },
    ];
    const ledger = createLedger(batches);
    const service = new CreditConsumptionService(ledger);

    const result = await service.consumeWithTx({} as never, 'student-1', 2);

    expect(result).toEqual({ consumed: 2, batchIds: ['expires-soon', 'expires-later'] });
    expect(batches).toEqual([
      { id: 'expires-soon', totalCredits: 1, usedCredits: 1 },
      { id: 'expires-later', totalCredits: 2, usedCredits: 1 },
    ]);
  });

  it('serializa chamadas concorrentes e impede saldo negativo ou dupla cobrança', async () => {
    const batches = [{ id: 'single-credit', totalCredits: 1, usedCredits: 0 }];
    const ledger = createLedger(batches);
    const service = new CreditConsumptionService(ledger);
    prismaMocks.transaction.mockImplementation(createSerializableTransaction());

    const first = service.consume('student-1', 1);
    const second = service.consume('student-1', 1);
    const results = await Promise.all([first, second]);

    expect(results).toEqual([
      { consumed: 1, batchIds: ['single-credit'] },
      null,
    ]);
    expect(batches[0].usedCredits).toBe(1);
    expect(ledger.consumeFromBatch).toHaveBeenCalledTimes(1);
    expect(prismaMocks.transaction).toHaveBeenCalledTimes(2);
  });

  it('repete a transação serializável quando o banco sinaliza conflito concorrente', async () => {
    const batches = [{ id: 'retry-credit', totalCredits: 1, usedCredits: 0 }];
    const ledger = createLedger(batches);
    const service = new CreditConsumptionService(ledger);
    const serializationError = Object.assign(new Error('write conflict'), { code: 'P2034' });

    prismaMocks.transaction
      .mockRejectedValueOnce(serializationError)
      .mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>, options?: { isolationLevel?: string }) => {
        expect(options?.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
        return fn({});
      });

    const result = await service.consume('student-1', 1);

    expect(result).toEqual({ consumed: 1, batchIds: ['retry-credit'] });
    expect(batches[0].usedCredits).toBe(1);
    expect(prismaMocks.transaction).toHaveBeenCalledTimes(2);
  });
});
