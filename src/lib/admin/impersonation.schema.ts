import { z } from 'zod';

/**
 * Domínio de impersonação admin (§12.5).
 * Valida abertura, TTL e encerramento auditável antes de persistir uma sessão
 * em que um admin assume a visão de um aluno.
 */

export const ADMIN_IMPERSONATION_END_REASONS = [
  'ADMIN_ENDED',
  'TTL_EXPIRED',
  'STUDENT_PASSWORD_RESET',
  'SECURITY_REVIEW',
  'SYSTEM_REVOKED',
] as const;

const MAX_TTL_MS = 2 * 60 * 60 * 1000;
const MIN_TTL_MS = 60 * 1000;

const normalizeEnumToken = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
};

const ipAddressSchema = z
  .string()
  .trim()
  .min(3, 'IP obrigatório')
  .max(45, 'IP excede 45 caracteres')
  .regex(/^[0-9a-fA-F:.]+$/, 'IP deve ser IPv4 ou IPv6 normalizado');

export const adminImpersonationEndReasonSchema = z.preprocess(
  normalizeEnumToken,
  z.enum(ADMIN_IMPERSONATION_END_REASONS),
);

export const startAdminImpersonationSchema = z
  .object({
    adminId: z.string().uuid('adminId inválido'),
    studentId: z.string().uuid('studentId inválido'),
    startedAt: z.coerce.date().default(() => new Date()),
    expiresAt: z.coerce.date(),
    reason: z.string().trim().min(10, 'Motivo deve explicar a necessidade de suporte').max(500),
    ipAddress: ipAddressSchema,
    userAgent: z.string().trim().min(1, 'User-agent obrigatório').max(512),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((session, ctx) => {
    if (session.adminId === session.studentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['studentId'],
        message: 'Admin não pode impersonar a própria conta',
      });
    }

    const ttlMs = session.expiresAt.getTime() - session.startedAt.getTime();
    if (ttlMs < MIN_TTL_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'TTL deve ter pelo menos 1 minuto',
      });
    }

    if (ttlMs > MAX_TTL_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'TTL não pode exceder 2 horas',
      });
    }
  })
  .transform((session) => ({
    ...session,
    activeAdminKey: session.adminId,
    activeStudentKey: session.studentId,
  }));

export const endAdminImpersonationSchema = z
  .object({
    id: z.string().uuid('id inválido'),
    endedAt: z.coerce.date().default(() => new Date()),
    endedById: z.string().uuid('endedById inválido'),
    endReason: adminImpersonationEndReasonSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((session) => ({
    ...session,
    activeAdminKey: null,
    activeStudentKey: null,
  }));

export const adminImpersonationQuerySchema = z
  .object({
    adminId: z.string().uuid('adminId inválido').optional(),
    studentId: z.string().uuid('studentId inválido').optional(),
    activeOnly: z.coerce.boolean().default(false),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    message: 'Janela temporal inválida',
  });

export const adminImpersonationReadSchema = z.object({
  id: z.string().uuid(),
  adminId: z.string().uuid(),
  studentId: z.string().uuid(),
  startedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  endedById: z.string().uuid().nullable(),
  endReason: adminImpersonationEndReasonSchema.nullable(),
  reason: z.string(),
  ipAddress: ipAddressSchema,
  userAgent: z.string(),
  activeAdminKey: z.string().nullable(),
  activeStudentKey: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).superRefine((session, ctx) => {
  // Espelha o CHECK admin_impersonation_sessions_active_state_chk (migration
  // 20260527000012): uma sessao aberta (endedAt null) deve manter as active keys
  // iguais a adminId/studentId e nao ter campos de encerramento; uma sessao
  // encerrada deve liberar as active keys e ter endReason (endedById e opcional,
  // pois a FK endedBy usa onDelete SetNull). Bloqueia estados auditaveis
  // incoerentes (AC3) que a forma de objeto sozinha aceitaria.
  const isOpen = session.endedAt === null;

  if (isOpen) {
    if (session.endReason !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endReason'], message: 'Sessao aberta nao pode ter endReason' });
    }
    if (session.endedById !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endedById'], message: 'Sessao aberta nao pode ter endedById' });
    }
    if (session.activeAdminKey !== session.adminId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activeAdminKey'], message: 'Sessao aberta deve manter activeAdminKey igual a adminId' });
    }
    if (session.activeStudentKey !== session.studentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activeStudentKey'], message: 'Sessao aberta deve manter activeStudentKey igual a studentId' });
    }
  } else {
    if (session.endReason === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endReason'], message: 'Sessao encerrada exige endReason auditavel' });
    }
    // endedById nao e exigido: a FK endedBy usa onDelete SetNull, entao pode ficar
    // nulo se o admin que encerrou for removido. O end-state auditavel vive em
    // endedAt + endReason (congruente com o CHECK da migration 012).
    if (session.activeAdminKey !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activeAdminKey'], message: 'Sessao encerrada deve liberar activeAdminKey' });
    }
    if (session.activeStudentKey !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activeStudentKey'], message: 'Sessao encerrada deve liberar activeStudentKey' });
    }
    if (session.endedAt !== null && session.endedAt < session.startedAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endedAt'], message: 'endedAt nao pode preceder startedAt' });
    }
  }
});

export type AdminImpersonationEndReason = z.infer<typeof adminImpersonationEndReasonSchema>;
export type StartAdminImpersonationInput = z.input<typeof startAdminImpersonationSchema>;
export type CreateAdminImpersonationData = z.output<typeof startAdminImpersonationSchema>;
export type EndAdminImpersonationInput = z.input<typeof endAdminImpersonationSchema>;
export type EndAdminImpersonationData = z.output<typeof endAdminImpersonationSchema>;
export type AdminImpersonationQuery = z.infer<typeof adminImpersonationQuerySchema>;
export type AdminImpersonationRead = z.infer<typeof adminImpersonationReadSchema>;
