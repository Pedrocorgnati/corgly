import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Domínio de feature flags (§12.4.2) — schemas Zod + resolver tipado.
 * Espelha os enums Prisma FeatureFlagScope / FeatureFlagAuditAction e suporta
 * rollout determinístico por usuário (hash estável) com override explícito e fallback.
 */

export const FEATURE_FLAG_SCOPES = ['GLOBAL', 'ROLE', 'COHORT'] as const;
export const FEATURE_FLAG_AUDIT_ACTIONS = [
  'CREATED',
  'ENABLED',
  'DISABLED',
  'ROLLOUT_CHANGED',
  'SCOPE_CHANGED',
  'OVERRIDE_SET',
  'OVERRIDE_CLEARED',
] as const;
export const USER_ROLES = ['STUDENT', 'ADMIN'] as const;

export const featureFlagScopeSchema = z.enum(FEATURE_FLAG_SCOPES);
export const featureFlagAuditActionSchema = z.enum(FEATURE_FLAG_AUDIT_ACTIONS);
export const userRoleSchema = z.enum(USER_ROLES);

/** Chave estável da flag usada no código (kebab/dot case, sem espaços). */
export const featureFlagKeySchema = z
  .string()
  .trim()
  .min(3, 'Chave muito curta')
  .max(64, 'Chave excede 64 caracteres')
  .regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/, 'Use minúsculas, dígitos, ponto, hífen ou underscore');

const rolloutSchema = z.coerce
  .number()
  .int('Rollout deve ser inteiro')
  .min(0, 'Rollout mínimo é 0')
  .max(100, 'Rollout máximo é 100');

/** Criação/edição administrativa de uma flag. */
export const upsertFeatureFlagSchema = z
  .object({
    key: featureFlagKeySchema,
    description: z.string().trim().min(1, 'Descrição obrigatória').max(280, 'Descrição excede 280 caracteres'),
    enabled: z.boolean().default(false),
    rolloutPercentage: rolloutSchema.default(0),
    scope: featureFlagScopeSchema.default('GLOBAL'),
    targetRole: userRoleSchema.optional(),
    targetCohort: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.scope === 'ROLE' && !val.targetRole) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetRole'], message: 'targetRole obrigatório para scope ROLE' });
    }
    if (val.scope === 'COHORT' && !val.targetCohort) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetCohort'], message: 'targetCohort obrigatório para scope COHORT' });
    }
  });

/** Override explícito de uma flag para um usuário (força on/off, ignora rollout). */
export const setFeatureFlagOverrideSchema = z.object({
  flagKey: featureFlagKeySchema,
  userId: z.string().uuid('userId inválido'),
  enabled: z.boolean(),
  reason: z.string().trim().max(280).optional(),
});

/** Consulta administrativa de flags. */
export const featureFlagQuerySchema = z.object({
  key: featureFlagKeySchema.optional(),
  scope: featureFlagScopeSchema.optional(),
  enabled: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpsertFeatureFlagInput = z.infer<typeof upsertFeatureFlagSchema>;
export type SetFeatureFlagOverrideInput = z.infer<typeof setFeatureFlagOverrideSchema>;
export type FeatureFlagQuery = z.infer<typeof featureFlagQuerySchema>;
export type FeatureFlagScope = z.infer<typeof featureFlagScopeSchema>;
export type FeatureFlagAuditAction = z.infer<typeof featureFlagAuditActionSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;

/** Estado mínimo de uma flag necessário para resolução (subset do model Prisma). */
export interface FeatureFlagState {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
  scope: FeatureFlagScope;
  targetRole?: UserRole | null;
  targetCohort?: string | null;
}

/** Contexto do usuário avaliado contra a flag. */
export interface FeatureFlagUserContext {
  userId: string;
  role?: UserRole | null;
  cohorts?: string[] | null;
  /** Override explícito previamente carregado (FeatureFlagOverride.enabled). */
  override?: boolean | null;
}

export interface FeatureFlagResolution {
  enabled: boolean;
  /** Como a decisão foi tomada — auditável e testável. */
  reason: 'override' | 'flag-disabled' | 'scope-miss' | 'rollout-in' | 'rollout-out' | 'fallback';
}

/**
 * Bucket determinístico 0..99 a partir de (key + userId). Estável entre processos
 * (hash sha256) — o mesmo par sempre cai no mesmo bucket, garantindo rollout consistente.
 */
export function rolloutBucket(flagKey: string, userId: string): number {
  const digest = createHash('sha256').update(`${flagKey}:${userId}`).digest('hex');
  // 8 primeiros hex chars = 32 bits; módulo 100 dá o bucket.
  return parseInt(digest.slice(0, 8), 16) % 100;
}

/**
 * Resolve uma flag para um usuário com fallback explícito.
 *
 * Ordem de precedência:
 *  1. override explícito (on/off forçado);
 *  2. flag globalmente desabilitada -> fallback;
 *  3. escopo não casa (ROLE/COHORT) -> fallback;
 *  4. rollout determinístico: bucket < rolloutPercentage -> on, senão fallback.
 *
 * `fallback` (default false) é retornado sempre que a flag não habilita o usuário,
 * garantindo Zero Estados Indefinidos (a função nunca retorna undefined).
 */
export function resolveFeatureFlag(
  flag: FeatureFlagState,
  user: FeatureFlagUserContext,
  fallback = false,
): FeatureFlagResolution {
  if (user.override !== undefined && user.override !== null) {
    return { enabled: user.override, reason: 'override' };
  }

  if (!flag.enabled) {
    return { enabled: fallback, reason: fallback ? 'fallback' : 'flag-disabled' };
  }

  if (flag.scope === 'ROLE' && flag.targetRole && user.role !== flag.targetRole) {
    return { enabled: fallback, reason: fallback ? 'fallback' : 'scope-miss' };
  }

  if (flag.scope === 'COHORT' && flag.targetCohort && !(user.cohorts ?? []).includes(flag.targetCohort)) {
    return { enabled: fallback, reason: fallback ? 'fallback' : 'scope-miss' };
  }

  const pct = Math.max(0, Math.min(100, flag.rolloutPercentage));
  if (pct >= 100) return { enabled: true, reason: 'rollout-in' };
  if (pct <= 0) return { enabled: fallback, reason: fallback ? 'fallback' : 'rollout-out' };

  const inRollout = rolloutBucket(flag.key, user.userId) < pct;
  if (inRollout) return { enabled: true, reason: 'rollout-in' };
  return { enabled: fallback, reason: fallback ? 'fallback' : 'rollout-out' };
}

/** Açúcar booleano para callers que só querem o on/off final. */
export function isFeatureEnabled(
  flag: FeatureFlagState,
  user: FeatureFlagUserContext,
  fallback = false,
): boolean {
  return resolveFeatureFlag(flag, user, fallback).enabled;
}
