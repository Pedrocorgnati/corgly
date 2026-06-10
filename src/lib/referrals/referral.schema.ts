import { z } from 'zod';

/**
 * Domínio de referrals (§12.4.3 / §12.4.4) — schemas Zod para convite e consulta do programa.
 * Espelha os enums Prisma ReferralStatus / ReferralInviteStatus / ReferralCreditStatus.
 */

export const REFERRAL_STATUSES = ['ACTIVE', 'PAUSED', 'DISABLED'] as const;
export const REFERRAL_INVITE_STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'] as const;
export const REFERRAL_CREDIT_STATUSES = ['PENDING', 'GRANTED', 'REVOKED'] as const;

export const referralStatusSchema = z.enum(REFERRAL_STATUSES);
export const referralInviteStatusSchema = z.enum(REFERRAL_INVITE_STATUSES);
export const referralCreditStatusSchema = z.enum(REFERRAL_CREDIT_STATUSES);

/** Envio de convite pelo participante do programa. */
export const createReferralInviteSchema = z.object({
  referralCode: z
    .string()
    .trim()
    .min(4, 'Código inválido')
    .max(32, 'Código excede 32 caracteres'),
  invitedEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail do convidado inválido'),
  expiresAt: z.coerce.date().optional(),
});

/** Aceite de um convite (convidado registra/usa o código). */
export const acceptReferralInviteSchema = z.object({
  referralCode: z.string().trim().min(4, 'Código inválido').max(32, 'Código excede 32 caracteres'),
  invitedUserId: z.string().uuid('invitedUserId inválido'),
});

/** Consulta do programa de referrals (lista de convites/créditos do participante). */
export const referralProgramQuerySchema = z.object({
  referrerId: z.string().uuid('referrerId inválido').optional(),
  code: z.string().trim().min(4).max(32).optional(),
  status: referralStatusSchema.optional(),
  inviteStatus: referralInviteStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateReferralInviteInput = z.infer<typeof createReferralInviteSchema>;
export type AcceptReferralInviteInput = z.infer<typeof acceptReferralInviteSchema>;
export type ReferralProgramQuery = z.infer<typeof referralProgramQuerySchema>;
export type ReferralStatus = z.infer<typeof referralStatusSchema>;
export type ReferralInviteStatus = z.infer<typeof referralInviteStatusSchema>;
export type ReferralCreditStatus = z.infer<typeof referralCreditStatusSchema>;
