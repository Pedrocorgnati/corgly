import 'server-only';
import crypto from 'crypto';

type AuthEvent =
  | 'login.failed'
  | 'register.duplicate'
  | 'token.invalid'
  | 'rbac.denied'
  | 'rate.limit.exceeded'
  | 'deletion.requested'
  | 'deletion.cancelled';

interface AuthFailureParams {
  event: AuthEvent;
  email?: string;
  userId?: string;
  ip?: string;
  route?: string;
  reason: string;
}

function hashPII(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function logAuthFailure(params: AuthFailureParams): void {
  const sanitized = {
    event: params.event,
    emailHash: params.email ? hashPII(params.email) : undefined,
    userId: params.userId,
    ip: params.ip,
    route: params.route,
    reason: params.reason,
    timestamp: new Date().toISOString(),
  };

  // NUNCA logar: senha, JWT token completo, tokens de reset em texto claro
  console.error('[AUTH]', JSON.stringify(sanitized));
}

export function logAuthSuccess(params: {
  event: 'login.success' | 'register.success' | 'password.reset' | 'email.confirmed';
  userId: string;
}): void {
  console.info('[AUTH]', JSON.stringify({ ...params, timestamp: new Date().toISOString() }));
}
