import { z } from 'zod';

/**
 * Domínio de perfil de onboarding (§12.4.4 / ON-03 / ON-04 / ON-08).
 * Separa patch parcial de perfil, goals e progresso para permitir autosave
 * granular sem reabrir etapas já concluídas.
 */

export const SUPPORTED_LANGUAGES = ['PT_BR', 'EN_US', 'ES_ES', 'IT_IT'] as const;
export const LANGUAGE_PROFICIENCY_LEVELS = [
  'BEGINNER',
  'ELEMENTARY',
  'INTERMEDIATE',
  'UPPER_INTERMEDIATE',
  'ADVANCED',
  'PROFICIENT',
] as const;
export const ONBOARDING_STEPS = ['WELCOME', 'PROFILE', 'GOALS', 'PREFERENCES', 'EQUIPMENT_CHECK', 'COMPLETED'] as const;
export const LANGUAGE_GOAL_TYPES = [
  'CONVERSATION',
  'BUSINESS',
  'TRAVEL',
  'EXAM_PREP',
  'CULTURE',
  'PRONUNCIATION',
  'GRAMMAR',
  'OTHER',
] as const;

export const supportedLanguageSchema = z.enum(SUPPORTED_LANGUAGES);
export const languageProficiencyLevelSchema = z.enum(LANGUAGE_PROFICIENCY_LEVELS);
export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);
export const languageGoalTypeSchema = z.enum(LANGUAGE_GOAL_TYPES);

export const onboardingTimezoneSchema = z
  .string()
  .trim()
  .min(1, 'Fuso horário obrigatório')
  .max(100, 'Fuso horário excede 100 caracteres')
  .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/, 'Use um fuso IANA válido, como America/Sao_Paulo');

export const onboardingPreferencesSchema = z.object({
  lessonCadence: z.enum(['WEEKLY', 'TWICE_WEEKLY', 'FLEXIBLE']).optional(),
  preferredSessionLengthMinutes: z.coerce.number().int().min(30).max(120).optional(),
  focusAreas: z.array(z.string().trim().min(2).max(80)).max(12).default([]),
  wantsHomework: z.boolean().default(true),
  wantsConversationFirst: z.boolean().default(true),
  accessibilityNotes: z.string().trim().max(1000).optional(),
});

export const languageGoalSchema = z.object({
  id: z.string().uuid().optional(),
  type: languageGoalTypeSchema,
  label: z.string().trim().min(2, 'Objetivo muito curto').max(120, 'Objetivo excede 120 caracteres'),
  description: z.string().trim().max(2000).optional(),
  priority: z.coerce.number().int().min(0).max(20).default(0),
  targetDate: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createOnboardingProfileSchema = z.object({
  userId: z.string().uuid('userId inválido'),
  currentLevel: languageProficiencyLevelSchema.default('BEGINNER'),
  preferredLanguage: supportedLanguageSchema.default('EN_US'),
  timezone: onboardingTimezoneSchema,
  currentStep: onboardingStepSchema.default('WELCOME'),
  preferences: onboardingPreferencesSchema.default({
    focusAreas: [],
    wantsHomework: true,
    wantsConversationFirst: true,
  }),
  goals: z.array(languageGoalSchema).max(8).default([]),
  notes: z.string().trim().max(4000).optional(),
});

export const patchOnboardingProfileSchema = z
  .object({
    currentLevel: languageProficiencyLevelSchema.optional(),
    preferredLanguage: supportedLanguageSchema.optional(),
    timezone: onboardingTimezoneSchema.optional(),
    currentStep: onboardingStepSchema.optional(),
    preferences: onboardingPreferencesSchema.partial().optional(),
    goals: z.array(languageGoalSchema).max(8).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    completedAt: z.coerce.date().nullable().optional(),
    skippedAt: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

export const onboardingProfileReadSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  currentLevel: languageProficiencyLevelSchema,
  preferredLanguage: supportedLanguageSchema,
  timezone: onboardingTimezoneSchema,
  currentStep: onboardingStepSchema,
  preferences: onboardingPreferencesSchema.nullable(),
  goals: z.array(languageGoalSchema),
  notes: z.string().nullable(),
  completedAt: z.coerce.date().nullable(),
  skippedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const onboardingProfileQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  currentStep: onboardingStepSchema.optional(),
  preferredLanguage: supportedLanguageSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SupportedLanguage = z.infer<typeof supportedLanguageSchema>;
export type LanguageProficiencyLevel = z.infer<typeof languageProficiencyLevelSchema>;
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;
export type LanguageGoalType = z.infer<typeof languageGoalTypeSchema>;
export type OnboardingPreferences = z.infer<typeof onboardingPreferencesSchema>;
export type LanguageGoalInput = z.infer<typeof languageGoalSchema>;
export type CreateOnboardingProfileInput = z.infer<typeof createOnboardingProfileSchema>;
export type PatchOnboardingProfileInput = z.infer<typeof patchOnboardingProfileSchema>;
export type OnboardingProfileRead = z.infer<typeof onboardingProfileReadSchema>;
export type OnboardingProfileQuery = z.infer<typeof onboardingProfileQuerySchema>;
