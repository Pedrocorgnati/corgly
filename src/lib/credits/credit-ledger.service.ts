import { Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';

export interface ConsumableCreditBatch {
  id: string;
  totalCredits: number;
  usedCredits: number;
}

export class CreditLedgerService {
  /**
   * Lista batches validos em ordem FEFO e bloqueia as linhas selecionadas.
   * Deve ser chamado dentro de uma transacao serializavel.
   */
  async listConsumableBatchesForUpdate(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<ConsumableCreditBatch[]> {
    return tx.$queryRaw<ConsumableCreditBatch[]>`
      SELECT id, totalCredits, usedCredits
      FROM credit_batches
      WHERE userId = ${userId}
        AND usedCredits < totalCredits
        AND (expiresAt > NOW() OR expiresAt IS NULL)
      ORDER BY
        CASE WHEN expiresAt IS NULL THEN 1 ELSE 0 END ASC,
        expiresAt ASC,
        createdAt ASC
      FOR UPDATE
    `;
  }

  async consumeFromBatch(
    tx: Prisma.TransactionClient,
    batchId: string,
    quantity: number,
  ): Promise<void> {
    const updated = await tx.$executeRaw`
      UPDATE credit_batches
      SET usedCredits = usedCredits + ${quantity}
      WHERE id = ${batchId}
        AND usedCredits + ${quantity} <= totalCredits
    `;

    if (Number(updated) !== 1) {
      throw new AppError('CREDIT_051', 'Consumo concorrente de creditos rejeitado.', 409);
    }
  }
}

export const creditLedgerService = new CreditLedgerService();
