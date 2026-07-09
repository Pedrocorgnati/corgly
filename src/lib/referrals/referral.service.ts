import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import type { Referral } from '@prisma/client';

/**
 * Regras de negócio do programa de indicações (referrals) do aluno.
 *
 * Decisões canônicas:
 * - Cada aluno tem UM programa de indicação (Referral) com um `code` único, criado
 *   sob demanda no primeiro acesso a GET /api/v1/referrals/me (ensureReferralForUser).
 * - O crédito é concedido UMA ÚNICA VEZ por convite aceito - garantido pela constraint
 *   `ReferralCredit.inviteId @unique` (idempotência por convite, não por tentativa).
 * - Crédito materializa-se como um CreditBatch tipo PROMO (sem expiração) ligado via
 *   `ReferralCredit.creditBatchId`, reusando o mesmo saldo consultado em /api/v1/credits.
 */

/** Quantidade de créditos concedida ao indicador por convite aceito. */
export const REFERRAL_CREDIT_AMOUNT = 1;

/** TTL padrão de um convite quando o cliente não informa `expiresAt` (30 dias). */
export const REFERRAL_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para códigos legíveis. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 5;

/** Gera um código de indicação aleatório e legível (8 chars, alfabeto sem ambíguos). */
export function generateReferralCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Retorna o programa de indicação do aluno, criando-o de forma idempotente no
 * primeiro acesso. Retenta em caso de colisão de `code` (constraint única).
 */
export async function ensureReferralForUser(userId: string): Promise<Referral> {
  const existing = await prisma.referral.findFirst({ where: { referrerId: userId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.referral.create({
        data: { code: generateReferralCode(), referrerId: userId, status: 'ACTIVE' },
      });
    } catch (err) {
      // P2002 = colisão de `code`; retenta com novo código. Outro erro propaga.
      if (isUniqueViolation(err) && attempt < MAX_CODE_ATTEMPTS - 1) continue;
      // Corrida: outro request criou o programa em paralelo, reusar o existente.
      const raced = await prisma.referral.findFirst({ where: { referrerId: userId } });
      if (raced) return raced;
      throw err;
    }
  }

  throw new AppError('REFERRAL_001', 'Não foi possível gerar um código de indicação único.', 500);
}

/** Detecta violação de constraint única do Prisma (P2002) sem importar o namespace. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
