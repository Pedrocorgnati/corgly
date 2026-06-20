import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { creditLedgerService, type CreditLedgerService } from './credit-ledger.service';

export interface CreditConsumptionResult {
  consumed: number;
  batchIds: string[];
}

const SERIALIZABLE_RETRY_ATTEMPTS = 3;
const SERIALIZABLE_RETRY_BASE_DELAY_MS = 25;
const SERIALIZATION_CONFLICT_CODES = new Set(['P2034', '40001', '1213']);

type RetryablePrismaError = Error & {
  code?: string;
  meta?: { code?: string };
};

function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const candidate = error as RetryablePrismaError;
  const code = candidate.code ?? candidate.meta?.code;
  if (code && SERIALIZATION_CONFLICT_CODES.has(code)) return true;

  return /serialization|deadlock|write conflict/i.test(error.message);
}

async function waitForRetry(attempt: number): Promise<void> {
  const delayMs = SERIALIZABLE_RETRY_BASE_DELAY_MS * attempt;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runSerializableCreditTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isSerializationConflict(error) || attempt === SERIALIZABLE_RETRY_ATTEMPTS) {
        throw error;
      }
      await waitForRetry(attempt);
    }
  }

  throw lastError;
}

export class CreditConsumptionService {
  constructor(private readonly ledger: CreditLedgerService = creditLedgerService) {}

  async consume(userId: string, quantity: number): Promise<CreditConsumptionResult | null> {
    if (quantity === 0) return { consumed: 0, batchIds: [] };

    try {
      return await runSerializableCreditTransaction((tx) => this.consumeWithTx(tx, userId, quantity));
    } catch (err) {
      if (err instanceof AppError && err.code === 'CREDIT_050') return null;
      throw err;
    }
  }

  async consumeOrNullWithTx(
    tx: Prisma.TransactionClient,
    userId: string,
    quantity: number,
  ): Promise<CreditConsumptionResult | null> {
    try {
      return await this.consumeWithTx(tx, userId, quantity);
    } catch (err) {
      if (err instanceof AppError && err.code === 'CREDIT_050') return null;
      throw err;
    }
  }

  async consumeOneOrNullWithTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<string | null> {
    const result = await this.consumeOrNullWithTx(tx, userId, 1);
    return result?.batchIds[0] ?? null;
  }

  async consumeWithTx(
    tx: Prisma.TransactionClient,
    userId: string,
    quantity: number,
  ): Promise<CreditConsumptionResult> {
    if (quantity === 0) return { consumed: 0, batchIds: [] };
    if (quantity < 0) throw new AppError('VAL_003', 'qty deve ser positivo', 400);

    const batches = await this.ledger.listConsumableBatchesForUpdate(tx, userId);
    let remaining = quantity;
    const batchIds: string[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const available = Number(batch.totalCredits) - Number(batch.usedCredits);
      const toConsume = Math.min(available, remaining);
      if (toConsume <= 0) continue;

      await this.ledger.consumeFromBatch(tx, batch.id, toConsume);
      batchIds.push(batch.id);
      remaining -= toConsume;
    }

    if (remaining > 0) {
      throw new AppError('CREDIT_050', 'Saldo de creditos insuficiente.', 400);
    }

    return { consumed: quantity, batchIds };
  }
}

export const creditConsumptionService = new CreditConsumptionService();
