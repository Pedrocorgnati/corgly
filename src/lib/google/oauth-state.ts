/**
 * @module lib/google/oauth-state
 * State assinado do fluxo OAuth do Google Calendar (anti-CSRF).
 *
 * JWT HS256 com `purpose` dedicado e expiracao curta (10 min): separa o state
 * dos tokens de sessao, cuja forma e `JwtPayload` (`src/lib/auth.ts`) com
 * `expiresIn` de `JWT_EXPIRES_IN`. Um token de sessao apresentado como state e
 * rejeitado pela assertiva de `purpose`.
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

const STATE_PURPOSE = 'google-calendar-oauth-state';

interface OAuthStatePayload {
  sub: string;
  nonce: string;
  purpose: string;
}

/** Assina o state do consentimento para o usuario (expira em 10 min). */
export function signOAuthState(userId: string): string {
  const payload: OAuthStatePayload = {
    sub: userId,
    nonce: randomUUID(),
    purpose: STATE_PURPOSE,
  };
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '10m' });
}

/** Verifica o state devolvido no callback; lanca AppError 400 se invalido. */
export function verifyOAuthState(state: string): { userId: string } {
  try {
    const payload = jwt.verify(state, env.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as Partial<OAuthStatePayload>;
    if (payload.purpose !== STATE_PURPOSE || typeof payload.sub !== 'string' || !payload.sub) {
      throw new Error('purpose_mismatch');
    }
    return { userId: payload.sub };
  } catch {
    throw new AppError(
      'GOOGLE_OAUTH_STATE_INVALID',
      'Estado de conexao com o Google invalido ou expirado. Tente conectar novamente.',
      400,
    );
  }
}
