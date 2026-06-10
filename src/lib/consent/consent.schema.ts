import { z } from 'zod';

/**
 * Dominio de consentimento legal e preferencias efetivas.
 * Necessario e sempre true; analytics e marketing sao preferencias revogaveis.
 */

export const CONSENT_CATEGORIES = ['necessary', 'analytics', 'marketing'] as const;
export const CONSENT_SOURCES = ['COOKIE_BANNER', 'ACCOUNT_SETTINGS', 'CHECKOUT', 'ADMIN', 'IMPORT'] as const;

export const consentCategorySchema = z.enum(CONSENT_CATEGORIES);
export const consentSourceSchema = z.enum(CONSENT_SOURCES);

export const consentVersionSchema = z
  .string()
  .trim()
  .min(1, 'Versao obrigatoria')
  .max(20, 'Versao excede 20 caracteres')
  .regex(/^[0-9A-Za-z._-]+$/, 'Versao deve usar letras, numeros, ponto, hifen ou underscore');

export const consentIdentitySchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    sessionFingerprint: z.string().trim().min(8).max(191).optional(),
  })
  .refine((data) => Boolean(data.userId || data.sessionFingerprint), {
    message: 'Informe userId ou sessionFingerprint',
    path: ['sessionFingerprint'],
  });

export const consentPreferencesSchema = z.object({
  necessary: z.literal(true).default(true),
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
});

export const upsertConsentPreferencesSchema = consentIdentitySchema.extend({
  preferences: consentPreferencesSchema,
  consentVersion: consentVersionSchema.default('1.0'),
  legalTextVersion: consentVersionSchema.default('1.0'),
  source: consentSourceSchema.default('COOKIE_BANNER'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const effectiveConsentQuerySchema = consentIdentitySchema;

export const effectiveConsentSchema = z.object({
  necessary: z.literal(true),
  analytics: z.boolean(),
  marketing: z.boolean(),
  consentVersion: consentVersionSchema.nullable(),
  legalTextVersion: consentVersionSchema.nullable(),
  source: consentSourceSchema.nullable(),
  updatedAt: z.date().nullable(),
});

export type ConsentCategory = z.infer<typeof consentCategorySchema>;
export type ConsentSource = z.infer<typeof consentSourceSchema>;
export type ConsentPreferences = z.infer<typeof consentPreferencesSchema>;
export type UpsertConsentPreferencesInput = z.infer<typeof upsertConsentPreferencesSchema>;
export type EffectiveConsentQuery = z.infer<typeof effectiveConsentQuerySchema>;
export type EffectiveConsent = z.infer<typeof effectiveConsentSchema>;
