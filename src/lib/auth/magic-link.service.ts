import 'server-only';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { signJWT } from '@/lib/auth';
import { emailService } from '@/services/email.service';
import { logAuthFailure, logAuthSuccess } from '@/lib/auth-logger';
import { EmailType } from '@/lib/constants/enums';
import type { SupportedLanguage } from '@/lib/constants/enums';
import { SupportedLanguage as SupportedLanguageEnum } from '@/lib/constants/enums';

/**
 * T-045 — Magic-link authentication (login sem senha).
 *
 * Modelo de segurança:
 *   - Token bruto = 32 bytes aleatórios (crypto.randomBytes) em hex.
 *   - Apenas o hash SHA-256 do token é persistido (lookup sempre por hash).
 *   - Expiração de 15 minutos.
 *   - Uso único: consumedAt marcado atomicamente; qualquer 2ª consumação é rejeitada.
 *   - Sem email enumeration: requestMagicLink resolve igual para email existente ou não.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://corgly.app';

/** Janela de validade do magic-link (AC1). */
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutos

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type MagicLinkConsumeResult =
  | { ok: true; token: string; user: { id: string; name: string; role: string } }
  | { ok: false; reason: 'INVALID_TOKEN' };

export class MagicLinkService {
  /**
   * Solicita um magic-link. Resposta uniforme (caller não distingue email
   * cadastrado de não cadastrado) — anti-enumeração (AC4).
   *
   * @param requesterIp IP do solicitante (auditoria). Pode ser 'unknown'.
   */
  async requestMagicLink(email: string, requesterIp = 'unknown'): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });

    // Email não cadastrado: no-op silencioso (mesma resposta no caller).
    if (!user) {
      logAuthFailure({ event: 'magic_link.requested', email, reason: 'user_not_found' });
      return;
    }

    // Conta em processo de exclusão: também no-op (não revela estado da conta).
    if (user.deletionRequestedAt) {
      logAuthFailure({ event: 'magic_link.requested', email, reason: 'account_pending_deletion' });
      return;
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.magicLinkToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requesterIp: requesterIp.slice(0, 64),
      },
    });

    const locale = (user.preferredLanguage as SupportedLanguage) ?? SupportedLanguageEnum.PT_BR;
    const link = `${BASE_URL}/auth/magic-link?token=${rawToken}`;

    await emailService
      .send({
        type: EmailType.MAGIC_LINK,
        to: user.email,
        data: { name: user.name, link },
        locale,
      })
      .catch((err) => console.error('[MagicLinkService] Failed to send magic-link email:', err));

    logAuthSuccess({ event: 'magic_link.sent', userId: user.id });
  }

  /**
   * Verifica e consome um magic-link de uso único (AC1 + AC3).
   *
   * - Lookup por hash (nunca pelo token bruto).
   * - Rejeita se: não encontrado, expirado, ou já consumido (anti-replay).
   * - Consumação atômica: updateMany com guarda consumedAt=null garante que
   *   apenas a primeira chamada concorrente vence (single-use real).
   *
   * Em sucesso, retorna um JWT assinado (mesmo formato do login) para o caller
   * emitir o cookie httpOnly. NÃO emite o cookie aqui (responsabilidade da page).
   */
  async consumeMagicLink(rawToken: string): Promise<MagicLinkConsumeResult> {
    if (!rawToken) return { ok: false, reason: 'INVALID_TOKEN' };

    const tokenHash = hashToken(rawToken);

    const record = await prisma.magicLinkToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // Não existe, já usado, ou expirado → estado explícito sem autenticar (AC3).
    if (!record || record.consumedAt !== null || record.expiresAt < new Date()) {
      logAuthFailure({ event: 'magic_link.failed', reason: 'invalid_or_expired' });
      return { ok: false, reason: 'INVALID_TOKEN' };
    }

    if (record.user.deletionRequestedAt) {
      logAuthFailure({ event: 'magic_link.failed', userId: record.userId, reason: 'account_pending_deletion' });
      return { ok: false, reason: 'INVALID_TOKEN' };
    }

    // Consumação atômica: só vence a 1ª chamada (guarda consumedAt: null).
    const consumed = await prisma.magicLinkToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (consumed.count !== 1) {
      // Outra requisição concorrente já consumiu este token (anti-replay).
      logAuthFailure({ event: 'magic_link.failed', userId: record.userId, reason: 'already_consumed' });
      return { ok: false, reason: 'INVALID_TOKEN' };
    }

    const user = record.user;

    const token = signJWT({ sub: user.id, role: user.role, version: user.tokenVersion });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logAuthSuccess({ event: 'magic_link.success', userId: user.id });

    return {
      ok: true,
      token,
      user: { id: user.id, name: user.name, role: user.role },
    };
  }
}

export const magicLinkService = new MagicLinkService();
