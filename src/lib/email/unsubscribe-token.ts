import jwt from 'jsonwebtoken';
import { env } from '@/lib/env';

/**
 * Tokens JWT assinados para unsubscribe.
 * Scope fixo "unsubscribe" + userId; expiracao 30 dias.
 *
 * Usa o mesmo JWT_SECRET da autenticacao com scope distinto para evitar confusao de tipos.
 */
export interface UnsubscribeTokenPayload {
  sub: string; // userId
  scope: 'unsubscribe';
}

const TOKEN_TTL = '30d';

export function signUnsubscribeToken(userId: string): string {
  const payload: UnsubscribeTokenPayload = { sub: userId, scope: 'unsubscribe' };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL,
  });
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as UnsubscribeTokenPayload;
    if (decoded?.scope !== 'unsubscribe' || !decoded?.sub) return null;
    return decoded;
  } catch {
    return null;
  }
}
