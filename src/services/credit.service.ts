import { prisma } from '@/lib/prisma';
import type { ManualCreditInput } from '@/schemas/credit.schema';

export interface CreditBalanceDTO {
  total: number;
  batches: {
    id: string;
    type: string;
    remaining: number;
    expiresAt: string | null;
  }[];
}

export class CreditService {
  async getBalance(userId: string): Promise<CreditBalanceDTO> {
    // TODO: Implementar via /auto-flow execute
    return { total: 0, batches: [] };
  }

  /**
   * FEFO: consume 1 credit from batch with lowest expiresAt.
   * Returns creditBatchId to link to Session.
   */
  async consumeFEFO(userId: string): Promise<string> {
    // TODO: Implementar via /auto-flow execute
    // 1. SELECT WHERE userId = ? AND remainingCredits > 0
    //    ORDER BY expiresAt ASC NULLS LAST, createdAt ASC LIMIT 1
    // 2. IF none → throw 'INSUFFICIENT_CREDITS'
    // 3. UPDATE SET usedCredits = usedCredits + 1
    // 4. RETURN batch.id
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async refund(sessionId: string): Promise<void> {
    // TODO: Implementar via /auto-flow execute
    // 1. Find session.creditBatchId
    // 2. UPDATE SET usedCredits = usedCredits - 1
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async createBatch(data: {
    userId: string;
    type: string;
    totalCredits: number;
    expiresAt?: Date | null;
    stripePaymentIntentId?: string;
    reason?: string;
  }) {
    // TODO: Implementar via /auto-flow execute
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async addManualCredits(data: ManualCreditInput) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async checkExpiring() {
    // TODO: Implementar via /auto-flow execute (used by CronService)
    return [];
  }

  async expireCredits(): Promise<void> {
    // TODO: Implementar via /auto-flow execute (cron diário 02:00 UTC)
    throw new Error('Not implemented - run /auto-flow execute');
  }
}

export const creditService = new CreditService();
