import { z } from 'zod';

export const CreateCheckoutSchema = z.object({
  packageType: z.enum(['SINGLE', 'PACK_5', 'PACK_10']),
});

export const CreateSubscriptionCheckoutSchema = z.object({
  weeklyFrequency: z.number().int().min(1).max(5),
});

export type CreateCheckoutInput = z.infer<typeof CreateCheckoutSchema>;
export type CreateSubscriptionCheckoutInput = z.infer<typeof CreateSubscriptionCheckoutSchema>;
