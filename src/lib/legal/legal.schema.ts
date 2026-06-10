import { z } from 'zod';

/**
 * Documentos legais versionados e aceite bloqueante (§12.4.4 / GL-19).
 * Os helpers abaixo sao puros para permitir uso em rotas, guards e testes.
 */

export const LEGAL_DOC_TYPES = ['TERMS', 'PRIVACY', 'COOKIES', 'DPA'] as const;
export const LEGAL_DOC_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export const LEGAL_ACCEPTANCE_SOURCES = [
  'REGISTER',
  'CHECKOUT',
  'LOGIN_BLOCKER',
  'ACCOUNT_SETTINGS',
  'ADMIN_IMPORT',
] as const;
export const LEGAL_DOC_LOCALES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;

export const legalDocTypeSchema = z.enum(LEGAL_DOC_TYPES);
export const legalDocStatusSchema = z.enum(LEGAL_DOC_STATUSES);
export const legalAcceptanceSourceSchema = z.enum(LEGAL_ACCEPTANCE_SOURCES);
export const legalDocLocaleSchema = z.enum(LEGAL_DOC_LOCALES);

export const legalDocVersionSchema = z
  .string()
  .trim()
  .min(1, 'Versao obrigatoria')
  .max(40, 'Versao excede 40 caracteres')
  .regex(/^[0-9A-Za-z._-]+$/, 'Versao deve usar letras, numeros, ponto, hifen ou underscore');

export const legalDocSlugSchema = z
  .string()
  .trim()
  .min(2, 'Slug muito curto')
  .max(200, 'Slug excede 200 caracteres')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug deve estar em kebab-case minusculo');

export const legalDocHashSha256Schema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, 'SHA-256 invalido');

export const createLegalDocSchema = z.object({
  type: legalDocTypeSchema,
  locale: legalDocLocaleSchema.default('PT_BR'),
  version: legalDocVersionSchema,
  title: z.string().trim().min(3).max(180),
  slug: legalDocSlugSchema,
  bodyMarkdown: z.string().trim().min(40, 'Documento legal muito curto'),
  contentHashSha256: legalDocHashSha256Schema.optional(),
  effectiveAt: z.coerce.date(),
  requiresAcceptance: z.boolean().default(true),
});

export const publishLegalDocSchema = z.object({
  legalDocId: z.string().trim().min(1),
  effectiveAt: z.coerce.date(),
  contentHashSha256: legalDocHashSha256Schema,
});

export const acceptLegalDocSchema = z.object({
  userId: z.string().trim().min(1),
  legalDocId: z.string().trim().min(1),
  type: legalDocTypeSchema,
  version: legalDocVersionSchema,
  acceptedAt: z.coerce.date().default(() => new Date()),
  source: legalAcceptanceSourceSchema.default('LOGIN_BLOCKER'),
  ipHash: legalDocHashSha256Schema.optional(),
  userAgent: z.string().trim().max(400).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const activeLegalDocSchema = z.object({
  id: z.string().trim().min(1),
  type: legalDocTypeSchema,
  locale: legalDocLocaleSchema,
  version: legalDocVersionSchema,
  title: z.string().trim().min(1),
  effectiveAt: z.coerce.date(),
  requiresAcceptance: z.boolean(),
  contentHashSha256: legalDocHashSha256Schema,
});

export const legalAcceptanceRecordSchema = z.object({
  userId: z.string().trim().min(1),
  legalDocId: z.string().trim().min(1).optional(),
  type: legalDocTypeSchema,
  version: legalDocVersionSchema,
  acceptedAt: z.coerce.date(),
});

export const pendingLegalAcceptanceQuerySchema = z.object({
  userId: z.string().trim().min(1),
  locale: legalDocLocaleSchema.default('PT_BR'),
  now: z.coerce.date().default(() => new Date()),
});

export const pendingLegalAcceptanceInputSchema = z.object({
  activeDocs: z.array(activeLegalDocSchema),
  acceptances: z.array(legalAcceptanceRecordSchema),
  now: z.coerce.date().default(() => new Date()),
});

export function findPendingLegalAcceptances(input: PendingLegalAcceptanceInput): ActiveLegalDoc[] {
  const parsed = pendingLegalAcceptanceInputSchema.parse(input);
  const accepted = new Set(parsed.acceptances.map((item) => `${item.type}:${item.version}`));

  return parsed.activeDocs.filter((doc) => {
    if (!doc.requiresAcceptance) return false;
    if (doc.effectiveAt > parsed.now) return false;
    return !accepted.has(`${doc.type}:${doc.version}`);
  });
}

export function hasPendingLegalAcceptance(input: PendingLegalAcceptanceInput): boolean {
  return findPendingLegalAcceptances(input).length > 0;
}

export type LegalDocType = z.infer<typeof legalDocTypeSchema>;
export type LegalDocStatus = z.infer<typeof legalDocStatusSchema>;
export type LegalAcceptanceSource = z.infer<typeof legalAcceptanceSourceSchema>;
export type LegalDocLocale = z.infer<typeof legalDocLocaleSchema>;
export type CreateLegalDocInput = z.infer<typeof createLegalDocSchema>;
export type PublishLegalDocInput = z.infer<typeof publishLegalDocSchema>;
export type AcceptLegalDocInput = z.infer<typeof acceptLegalDocSchema>;
export type ActiveLegalDoc = z.infer<typeof activeLegalDocSchema>;
export type LegalAcceptanceRecord = z.infer<typeof legalAcceptanceRecordSchema>;
export type PendingLegalAcceptanceQuery = z.infer<typeof pendingLegalAcceptanceQuerySchema>;
export type PendingLegalAcceptanceInput = z.input<typeof pendingLegalAcceptanceInputSchema>;
