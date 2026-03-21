import { z } from 'zod';

export const ManualCreditSchema = z.object({
  userId: z.string().uuid(),
  credits: z.number().int().min(1).max(50),
  reason: z.string().min(5).max(500),
  expiresAt: z.string().datetime().optional(),
});

export type ManualCreditInput = z.infer<typeof ManualCreditSchema>;
