// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    JWT_SECRET: 'x'.repeat(32),
    JWT_EXPIRES_IN: '7d',
    CRON_SECRET: 'x'.repeat(16),
    HOCUSPOCUS_JWT_SECRET: 'x'.repeat(32),
    ENCRYPTION_KEY: 'x'.repeat(32),
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
    RESEND_API_KEY: 're_test_fake',
    EMAIL_FROM: 'noreply@corgly.test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    NEXT_PUBLIC_HOCUSPOCUS_URL: 'ws://localhost:1234',
  });
});

import jwt from 'jsonwebtoken';
import { signJWT } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { signOAuthState, verifyOAuthState } from '@/lib/google/oauth-state';

/** Captura o AppError lancado e devolve o `code` (o codigo mora em `.code`, nao na mensagem). */
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return (err as AppError).code;
  }
  throw new Error('esperava lancamento de AppError');
}

describe('lib/google/oauth-state', () => {
  it('state valido verifica e devolve o userId', () => {
    const state = signOAuthState('admin-1');
    expect(verifyOAuthState(state)).toEqual({ userId: 'admin-1' });
  });

  it('state adulterado lanca GOOGLE_OAUTH_STATE_INVALID', () => {
    const state = signOAuthState('admin-1');
    const adulterado = state.slice(0, -2) + (state.endsWith('a') ? 'b' : 'a');
    expect(codeOf(() => verifyOAuthState(adulterado))).toBe('GOOGLE_OAUTH_STATE_INVALID');
  });

  it('token com purpose errado e rejeitado', () => {
    const outro = jwt.sign(
      { sub: 'admin-1', nonce: 'n', purpose: 'outro-purpose' },
      'x'.repeat(32),
      { algorithm: 'HS256', expiresIn: '10m' },
    );
    expect(codeOf(() => verifyOAuthState(outro))).toBe('GOOGLE_OAUTH_STATE_INVALID');
  });

  it('token de sessao (signJWT) NAO serve como state', () => {
    const sessionToken = signJWT({ sub: 'admin-1', role: 'ADMIN', version: 0 });
    expect(codeOf(() => verifyOAuthState(sessionToken))).toBe('GOOGLE_OAUTH_STATE_INVALID');
  });

  it('state expirado e rejeitado', () => {
    const expirado = jwt.sign(
      { sub: 'admin-1', nonce: 'n', purpose: 'google-calendar-oauth-state' },
      'x'.repeat(32),
      { algorithm: 'HS256', expiresIn: '-1s' },
    );
    expect(codeOf(() => verifyOAuthState(expirado))).toBe('GOOGLE_OAUTH_STATE_INVALID');
  });
});
