import { z } from 'zod';

/**
 * Domínio de leads (§12.4.3) — schemas Zod para captação pública e triagem.
 * Espelha os enums Prisma LeadOrigin / LeadStatus e o enum SupportedLanguage (locale).
 *
 * IMPORTANTE: o schema público (`createLeadSchema`) NUNCA aceita campos internos
 * (status, ipHash, userAgent, honeypotHit, spamScore). Esses são preenchidos pelo
 * servidor a partir do contexto da requisição, não pelo cliente.
 */

export const LEAD_ORIGINS = ['LANDING', 'METHOD', 'CONTACT'] as const;
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'SPAM', 'ARCHIVED'] as const;
export const LEAD_LOCALES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;

export const leadOriginSchema = z.enum(LEAD_ORIGINS);
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const leadLocaleSchema = z.enum(LEAD_LOCALES);

/**
 * Captação pública de lead (landing, método, contato).
 * Só expõe os campos que o visitante de fato preenche; consentimento é obrigatório.
 * O honeypot (`website`) é um campo isca: bots tendem a preenchê-lo, humanos o deixam vazio.
 */
export const createLeadSchema = z
  .object({
    origin: leadOriginSchema,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('E-mail inválido')
      .max(254, 'E-mail excede 254 caracteres'),
    name: z.string().trim().min(1, 'Nome obrigatório').max(160, 'Nome excede 160 caracteres').optional(),
    message: z.string().trim().max(2000, 'Mensagem excede 2000 caracteres').optional(),
    locale: leadLocaleSchema.default('PT_BR'),
    consent: z.literal(true, {
      message: 'É necessário aceitar a política de privacidade',
    }),
    // honeypot anti-bot: deve chegar vazio. Preenchido => spam.
    website: z.string().max(0, 'Spam detectado').optional(),
  })
  .superRefine((data, ctx) => {
    // Contato exige mensagem; landing/método podem ser apenas e-mail + consentimento.
    if (data.origin === 'CONTACT' && (!data.message || data.message.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['message'],
        message: 'Mensagem é obrigatória no formulário de contato',
      });
    }
  });

/** Triagem administrativa de um lead (admin only) — altera status/consentimento de abuso. */
export const updateLeadStatusSchema = z.object({
  status: leadStatusSchema,
});

/** Consulta administrativa de leads (lista paginada com filtros). */
export const leadQuerySchema = z.object({
  origin: leadOriginSchema.optional(),
  status: leadStatusSchema.optional(),
  locale: leadLocaleSchema.optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type LeadQuery = z.infer<typeof leadQuerySchema>;
export type LeadOrigin = z.infer<typeof leadOriginSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;
