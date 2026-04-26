import { z } from 'zod';

export const CurrencyEnum = z.enum(['BRL', 'USD', 'EUR', 'USDC']);

export const CreateCheckoutSchema = z.object({
  packageType: z.enum(['SINGLE', 'PACK_5', 'PACK_10']),
  currency: CurrencyEnum.optional(),
});

export const CreateSubscriptionCheckoutSchema = z.object({
  weeklyFrequency: z.number().int().min(1).max(5),
  currency: CurrencyEnum.optional(),
});

export type CreateCheckoutInput = z.infer<typeof CreateCheckoutSchema>;
export type CreateSubscriptionCheckoutInput = z.infer<typeof CreateSubscriptionCheckoutSchema>;
