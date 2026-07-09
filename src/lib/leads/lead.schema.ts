import { z } from 'zod';

/**
 * Domínio de leads (§12.4.3) — ponto de entrada único para todos os schemas de lead.
 * Cobre captação pública, validação client-side do formulário e triagem/consulta admin.
 * Espelha os enums Prisma LeadOrigin / LeadStatus / SupportedLanguage (locale).
 *
 * IMPORTANTE: LeadSubmitSchema NUNCA aceita campos internos
 * (status, ipHash, userAgent, honeypotHit, spamScore). Esses são preenchidos pelo
 * servidor a partir do contexto da requisição, não pelo cliente.
 * O honeypot (LEAD_HONEYPOT_FIELD) é lido pelo endpoint FORA da validação Zod
 * para não revelar a heurística; bots recebem 200 silencioso.
 */

export const LEAD_ORIGINS = ['LANDING', 'METHOD', 'CONTACT'] as const;
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'SPAM', 'ARCHIVED'] as const;
export const LEAD_LOCALES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;

export type LeadOriginValue = (typeof LEAD_ORIGINS)[number];
export type LeadLocaleValue = (typeof LEAD_LOCALES)[number];

export const leadOriginSchema = z.enum(LEAD_ORIGINS);
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const leadLocaleSchema = z.enum(LEAD_LOCALES);

/**
 * Campo isca (honeypot). Renderizado escondido para humanos; bots tendem a preenchê-lo.
 * Lido pelo servidor FORA da validação Zod — nunca incluir no schema público.
 */
export const LEAD_HONEYPOT_FIELD = 'website' as const;

// ---------- campos compartilhados ----------

const emailField = z
  .string({ message: 'Informe seu e-mail.' })
  .trim()
  .toLowerCase()
  .min(1, 'Informe seu e-mail.')
  .max(160, 'E-mail muito longo.')
  .email('E-mail inválido.');

const nameField = z
  .string()
  .trim()
  .max(160, 'Nome muito longo.')
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const messageField = z
  .string()
  .trim()
  .max(2000, 'Mensagem muito longa (máx. 2000 caracteres).')
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const consentField = z
  .boolean()
  .refine((v) => v === true, {
    message: 'É necessário aceitar o contato para enviar.',
  });

// ---------- captação pública ----------

/**
 * Campos visíveis preenchidos pelo usuário no formulário (validação client-side via zodResolver).
 * `origin` e `locale` são injetados pelo componente no submit, não digitados pelo usuário.
 */
export const LeadFormFieldsSchema = z.object({
  name: nameField,
  email: emailField,
  message: messageField,
  consentGiven: consentField,
});
export type LeadFormFields = z.input<typeof LeadFormFieldsSchema>;

/**
 * Payload completo aceito pelo endpoint POST /api/v1/leads (validação server-side).
 * Landing, método e contato postam para o mesmo endpoint com a mesma forma de payload;
 * a `origin` distingue a fonte para triagem e análise.
 * Honeypot e captchaToken são opcionais e tratados separadamente da validação de negócio.
 */
export const LeadSubmitSchema = z.object({
  origin: leadOriginSchema,
  email: emailField,
  name: nameField,
  message: messageField,
  locale: leadLocaleSchema.default('PT_BR'),
  consentGiven: consentField,
  captchaToken: z.string().max(4000).optional(),
});
export type LeadSubmitInput = z.input<typeof LeadSubmitSchema>;
export type LeadSubmitData = z.output<typeof LeadSubmitSchema>;

/** @deprecated Use LeadSubmitSchema. Alias de compatibilidade com o domínio task-005. */
export const createLeadSchema = LeadSubmitSchema;
export type CreateLeadInput = LeadSubmitInput;

// ---------- schemas admin ----------

/** Triagem administrativa de um lead (admin only) — altera status. */
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

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type LeadQuery = z.infer<typeof leadQuerySchema>;
export type LeadOrigin = z.infer<typeof leadOriginSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;
