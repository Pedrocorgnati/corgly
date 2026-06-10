import { z } from 'zod';

/**
 * Domínio de email templates e deliveries (§12.4.4).
 * Templates são versionados por tipo, locale e canal. A validação aceita HTML
 * limitado, mas bloqueia script, handlers inline e URLs executáveis.
 */

export const EMAIL_TEMPLATE_TYPES = [
  'CONFIRM_EMAIL',
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'BOOKING_REMINDER_24H',
  'BOOKING_REMINDER_1H',
  'PASSWORD_RESET',
  'CREDIT_EXPIRY_WARNING',
  'PAYMENT_RECEIPT',
  'SUBSCRIPTION_CANCELLED',
  'BULK_CANCEL_NOTIFICATION',
  'PURCHASE_CONFIRMED',
  'SUBSCRIPTION_PAYMENT_FAILED',
  'SESSION_INTERRUPTED',
  'RECURRING_BOOKING_FAILED',
  'ACCOUNT_DELETION_REQUESTED',
  'DATA_EXPORT_READY',
  'FEEDBACK_AVAILABLE',
  'BOOKING_RESCHEDULED',
] as const;

export const EMAIL_TEMPLATE_LOCALES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;
export const EMAIL_CHANNELS = ['EMAIL'] as const;
export const EMAIL_TEMPLATE_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export const EMAIL_DELIVERY_STATUSES = ['QUEUED', 'SENT', 'FAILED', 'SKIPPED'] as const;

const unsafeHtmlPattern = /<\s*script\b|javascript\s*:|data\s*:\s*text\/html|on[a-z]+\s*=|<\s*(iframe|object|embed|form|input|button|meta|link)\b/i;
const templateVariablePattern = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;

export const emailTemplateTypeSchema = z.enum(EMAIL_TEMPLATE_TYPES);
export const emailTemplateLocaleSchema = z.enum(EMAIL_TEMPLATE_LOCALES);
export const emailChannelSchema = z.enum(EMAIL_CHANNELS);
export const emailTemplateStatusSchema = z.enum(EMAIL_TEMPLATE_STATUSES);
export const emailDeliveryStatusSchema = z.enum(EMAIL_DELIVERY_STATUSES);

export const templateVariablesSchema = z
  .array(z.string().trim().regex(templateVariablePattern, 'Variável inválida'))
  .max(30, 'Máximo de 30 variáveis por template')
  .default([]);

export const safeTemplateHtmlSchema = z
  .string()
  .trim()
  .min(1, 'HTML do template é obrigatório')
  .max(80_000, 'HTML do template excede 80KB')
  .refine((html) => !unsafeHtmlPattern.test(html), {
    message: 'HTML contém script, handler inline, tag interativa ou URL insegura',
  });

export const emailTemplateBaseSchema = z.object({
  type: emailTemplateTypeSchema,
  locale: emailTemplateLocaleSchema,
  channel: emailChannelSchema.default('EMAIL'),
  version: z.coerce.number().int('Versão deve ser inteira').min(1, 'Versão mínima é 1'),
  status: emailTemplateStatusSchema.default('DRAFT'),
  subject: z.string().trim().min(1, 'Assunto obrigatório').max(180, 'Assunto excede 180 caracteres'),
  preheader: z.string().trim().max(180, 'Preheader excede 180 caracteres').optional(),
  htmlBody: safeTemplateHtmlSchema,
  textBody: z.string().trim().max(80_000, 'Texto do template excede 80KB').optional(),
  variables: templateVariablesSchema,
});

export const createEmailTemplateSchema = emailTemplateBaseSchema.superRefine((data, ctx) => {
  if (data.status === 'ACTIVE' && data.htmlBody.includes('{{') && data.variables.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['variables'],
      message: 'Template ativo com placeholders deve declarar variáveis',
    });
  }
});

export const updateEmailTemplateSchema = emailTemplateBaseSchema
  .partial()
  .extend({
    id: z.string().uuid('id inválido'),
  })
  .refine((data) => Object.keys(data).some((key) => key !== 'id'), {
    message: 'Informe ao menos um campo para atualizar',
  });

export const emailDeliveryLogSchema = z.object({
  templateId: z.string().uuid('templateId inválido').optional(),
  type: emailTemplateTypeSchema,
  locale: emailTemplateLocaleSchema,
  channel: emailChannelSchema.default('EMAIL'),
  toEmail: z.string().trim().toLowerCase().email('E-mail de destino inválido').max(254),
  userId: z.string().uuid('userId inválido').optional(),
  provider: z.string().trim().max(80).optional(),
  providerMessageId: z.string().trim().max(191).optional(),
  status: emailDeliveryStatusSchema.default('QUEUED'),
  subject: z.string().trim().min(1).max(180),
  renderedHtml: safeTemplateHtmlSchema.optional(),
  renderedText: z.string().trim().max(80_000).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().trim().max(80).optional(),
  errorMessage: z.string().trim().max(4000).optional(),
  attempts: z.coerce.number().int().min(0).max(20).default(0),
});

export type EmailTemplateType = z.infer<typeof emailTemplateTypeSchema>;
export type EmailTemplateLocale = z.infer<typeof emailTemplateLocaleSchema>;
export type EmailChannel = z.infer<typeof emailChannelSchema>;
export type EmailTemplateStatus = z.infer<typeof emailTemplateStatusSchema>;
export type EmailDeliveryStatus = z.infer<typeof emailDeliveryStatusSchema>;
export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
export type EmailDeliveryLogInput = z.infer<typeof emailDeliveryLogSchema>;
