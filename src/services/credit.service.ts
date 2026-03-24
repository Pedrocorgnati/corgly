import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import type { ManualCreditInput } from '@/schemas/credit.schema';

/** Lote de créditos com saldo calculado — usado em getBreakdown e checkExpiring. */
export interface BreakdownItem {
  id: string;
  userId?: string;
  type: string;
  totalCredits: number;
  usedCredits: number;
  remaining: number;
  expiresAt: string | null;
  createdAt: string;
}

const CREDIT_EXPIRY_6M_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const TYPES_WITH_EXPIRY = ['SINGLE', 'PACK_5', 'PACK_10'] as const;

export class CreditService {
  /**
   * Retorna saldo total de créditos válidos (não expirados, com remaining > 0).
   * Usa $queryRaw para SUM eficiente e consistência com getBreakdown.
   */
  async getBalance(userId: string): Promise<number> {
    const result = await prisma.$queryRaw<[{ total: bigint }]>`
      SELECT COALESCE(SUM(totalCredits - usedCredits), 0) AS total
      FROM credit_batches
      WHERE userId = ${userId}
        AND usedCredits < totalCredits
        AND (expiresAt > NOW() OR expiresAt IS NULL)
    `;
    return Number(result[0].total);
  }

  /**
   * Retorna lista de batches ativos ordenados por expiresAt ASC (FEFO order).
   * Prisma/MySQL não suporta nullsLast nativo — usa $queryRaw com CASE WHEN.
   */
  async getBreakdown(userId: string): Promise<BreakdownItem[]> {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        type: string;
        totalCredits: number;
        usedCredits: number;
        expiresAt: Date | null;
        createdAt: Date;
      }>
    >`
      SELECT id, type, totalCredits, usedCredits, expiresAt, createdAt
      FROM credit_batches
      WHERE userId = ${userId}
        AND usedCredits < totalCredits
        AND (expiresAt > NOW() OR expiresAt IS NULL)
      ORDER BY
        CASE WHEN expiresAt IS NULL THEN 1 ELSE 0 END ASC,
        expiresAt ASC,
        createdAt ASC
    `;
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      totalCredits: Number(r.totalCredits),
      usedCredits: Number(r.usedCredits),
      remaining: Number(r.totalCredits) - Number(r.usedCredits),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * FEFO: First-Expired First-Out — algoritmo central.
   * Consome créditos atomicamente com SELECT FOR UPDATE (lock de linha).
   *
   * Assinatura IMUTÁVEL — module-6/BookingService depende deste contrato.
   * Retorna null (não lança) se saldo insuficiente.
   */
  async consume(
    userId: string,
    qty: number,
  ): Promise<{ consumed: number; batchIds: string[] } | null> {
    if (qty === 0) return { consumed: 0, batchIds: [] };
    if (qty < 0) throw new AppError('VAL_003', 'qty deve ser positivo', 400);

    try {
      return await prisma.$transaction(async (tx) => {
        const batches = await tx.$queryRaw<
          Array<{ id: string; totalCredits: number; usedCredits: number }>
        >`
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

        let remaining = qty;
        const batchIds: string[] = [];

        for (const batch of batches) {
          if (remaining <= 0) break;
          const available = Number(batch.totalCredits) - Number(batch.usedCredits);
          const toConsume = Math.min(available, remaining);

          await tx.$executeRaw`
            UPDATE credit_batches SET usedCredits = usedCredits + ${toConsume} WHERE id = ${batch.id}
          `;
          batchIds.push(batch.id);
          remaining -= toConsume;
        }

        if (remaining > 0) {
          throw new AppError('CREDIT_050', 'Saldo de créditos insuficiente.', 400);
        }

        return { consumed: qty, batchIds };
      });
    } catch (err) {
      if (err instanceof AppError && err.code === 'CREDIT_050') return null;
      throw err;
    }
  }

  /**
   * Devolve créditos ao batch original (creditBatchId) ou cria batch REFUND.
   * Não permite usedCredits negativo (floor 0).
   */
  async refund(userId: string, qty: number, creditBatchId?: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      if (creditBatchId) {
        const batch = await tx.creditBatch.findFirst({
          where: { id: creditBatchId, userId },
        });
        if (!batch) throw new AppError('SYS_001', 'CreditBatch não encontrado para refund.', 500);

        const safeRefund = Math.min(qty, batch.usedCredits);
        await tx.creditBatch.update({
          where: { id: creditBatchId },
          data: { usedCredits: { decrement: safeRefund } },
        });
      } else {
        await tx.creditBatch.create({
          data: {
            userId,
            type: 'REFUND',
            totalCredits: qty,
            usedCredits: 0,
            expiresAt: null,
            reason: 'Refund automático',
          },
        });
      }
    });
  }

  /**
   * Devolve créditos ao batch original dentro de uma $transaction externa.
   * Use dentro de prisma.$transaction() para garantir atomicidade com o update de sessão.
   */
  async refundWithTx(
    tx: Prisma.TransactionClient,
    userId: string,
    qty: number,
    creditBatchId?: string,
  ): Promise<void> {
    if (creditBatchId) {
      const batch = await tx.creditBatch.findFirst({
        where: { id: creditBatchId, userId },
      });
      if (!batch) throw new AppError('SYS_001', 'CreditBatch não encontrado para refund.', 500);

      const safeRefund = Math.min(qty, batch.usedCredits);
      await tx.creditBatch.update({
        where: { id: creditBatchId },
        data: { usedCredits: { decrement: safeRefund } },
      });
    } else {
      await tx.creditBatch.create({
        data: {
          userId,
          type: 'REFUND',
          totalCredits: qty,
          usedCredits: 0,
          expiresAt: null,
          reason: 'Refund automático',
        },
      });
    }
  }

  /**
   * Cria um novo CreditBatch com expiresAt calculado por tipo.
   * SINGLE/PACK_5/PACK_10 → expiresAt = NOW + 6 meses.
   * MONTHLY/MANUAL/PROMO/REFUND → sem expiração.
   */
  async createBatch(data: {
    userId: string;
    type: string;
    totalCredits: number;
    expiresAt?: Date | null;
    stripePaymentIntentId?: string;
    reason?: string;
  }) {
    const resolvedExpiry =
      data.expiresAt !== undefined
        ? data.expiresAt
        : (TYPES_WITH_EXPIRY as readonly string[]).includes(data.type)
          ? new Date(Date.now() + CREDIT_EXPIRY_6M_MS)
          : null;

    return prisma.creditBatch.create({
      data: {
        userId: data.userId,
        type: data.type as 'SINGLE' | 'PACK_5' | 'PACK_10' | 'MONTHLY' | 'PROMO' | 'MANUAL' | 'REFUND',
        totalCredits: data.totalCredits,
        usedCredits: 0,
        expiresAt: resolvedExpiry,
        stripePaymentIntentId: data.stripePaymentIntentId ?? null,
        reason: data.reason ?? null,
      },
    });
  }

  /**
   * Ajuste manual de créditos por admin. Positive = adicionar batch MANUAL.
   * Razão mínima de 10 chars (CREDIT_052).
   */
  async addManualCredits(data: ManualCreditInput) {
    if (data.reason.trim().length < 10) {
      throw new AppError('CREDIT_052', 'A razão deve ter no mínimo 10 caracteres.', 400);
    }

    await prisma.creditBatch.create({
      data: {
        userId: data.userId,
        type: 'MANUAL',
        totalCredits: data.credits,
        usedCredits: 0,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        reason: data.reason.trim(),
      },
    });

    const newBalance = await this.getBalance(data.userId);
    return { newBalance };
  }

  /**
   * Retorna batches expirando nos próximos 30 dias.
   * Usado pelo CronService para notificações de 7d e 30d.
   */
  async checkExpiring(): Promise<(BreakdownItem & { userId: string })[]> {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        type: string;
        totalCredits: number;
        usedCredits: number;
        expiresAt: Date | null;
        createdAt: Date;
      }>
    >`
      SELECT id, userId, type, totalCredits, usedCredits, expiresAt, createdAt
      FROM credit_batches
      WHERE usedCredits < totalCredits
        AND expiresAt IS NOT NULL
        AND expiresAt > NOW()
        AND expiresAt <= DATE_ADD(NOW(), INTERVAL 30 DAY)
      ORDER BY expiresAt ASC
    `;
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      type: r.type,
      totalCredits: Number(r.totalCredits),
      usedCredits: Number(r.usedCredits),
      remaining: Number(r.totalCredits) - Number(r.usedCredits),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Marca créditos expirados como totalmente usados (soft-expire).
   * Executado pelo cron diário às 03:00 UTC.
   */
  async expireCredits(): Promise<void> {
    await prisma.$executeRaw`
      UPDATE credit_batches
      SET usedCredits = totalCredits
      WHERE expiresAt IS NOT NULL
        AND expiresAt < NOW()
        AND usedCredits < totalCredits
    `;
  }
}

export const creditService = new CreditService();
