import { z } from 'zod';

export const CurrencyEnum = z.enum(['BRL', 'USD', 'EUR', 'USDC']);

export const CreateCheckoutSchema = z.object({
  packageType: z.enum(['SINGLE', 'PACK_5', 'PACK_10']),
  currency: CurrencyEnum.optional(),
});

/**
 * Volumes mensais publicados na landing (MONTHLY_OPTIONS): 10 ou 20 aulas/mes.
 * Literais fechados de proposito — volume fora do catalogo nao tem preco e nao
 * pode virar cobranca inventada.
 */
export const MonthlyLessonsEnum = z.union([z.literal(10), z.literal(20)]);
export type MonthlyLessonsPlan = z.infer<typeof MonthlyLessonsEnum>;

/**
 * Assinatura tem DOIS eixos mutuamente exclusivos:
 *
 *  - `monthlyLessons` (canonico): volume mensal contratado, 10 ou 20 aulas.
 *    Precificado pela tabela unica em `src/lib/pricing/config.ts`.
 *  - `weeklyFrequency` (legado): cadencia semanal 1..5, preco legado por
 *    `calculateSubscriptionMonthlyAmountCents`. Mantido para nao quebrar as
 *    assinaturas antigas e os clientes que ainda enviam esse campo.
 *
 * O refine exige EXATAMENTE um dos dois: nenhum eixo nao da para precificar e
 * os dois juntos deixariam o preco ambiguo (Zero Assumido).
 */
export const CreateSubscriptionCheckoutSchema = z
  .object({
    monthlyLessons: MonthlyLessonsEnum.optional(),
    weeklyFrequency: z.number().int().min(1).max(5).optional(),
    currency: CurrencyEnum.optional(),
  })
  .refine(
    (data) => (data.monthlyLessons !== undefined) !== (data.weeklyFrequency !== undefined),
    {
      message:
        'Informe exatamente um eixo de assinatura: monthlyLessons (10 ou 20 aulas por mes) ou weeklyFrequency (1 a 5 aulas por semana).',
      path: ['monthlyLessons'],
    },
  );

export type CreateCheckoutInput = z.infer<typeof CreateCheckoutSchema>;
export type CreateSubscriptionCheckoutInput = z.infer<typeof CreateSubscriptionCheckoutSchema>;
