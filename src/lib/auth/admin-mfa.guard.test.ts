// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// `@/lib/env` valida TODAS as env vars no import (o guard importa apiResponse e
// getPayloadFromRequest de @/lib/auth, que importa env). Semeamos process.env
// antes de qualquer import estatico (vi.hoisted roda primeiro).
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

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/audit/audit-logger', () => ({ auditLog: mocks.auditLog }));

import { COOKIE_NAME, signJWT } from '@/lib/auth';
import { MFA_RECENT_WINDOW_SECONDS } from '@/lib/auth/mfa-recency';
import {
  MFA_REQUIRED_CODE,
  MFA_REQUIRED_MESSAGE,
  hasRecentMfa,
  rejectStaleMfa,
  requireAdminWithRecentMfa,
} from './admin-mfa.guard';

const ADMIN_ID = 'admin-1';
const ADMIN_USER = { id: ADMIN_ID, email: 'admin@corgly.test', role: 'ADMIN' };

/** Request com cookie de sessao admin; `mfaAt` ausente = sessao sem MFA recente. */
function buildRequest(opts: { mfaAt?: number; noCookie?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (!opts.noCookie) {
    const token = signJWT({
      sub: ADMIN_ID,
      role: 'ADMIN',
      version: 0,
      mfaAt: opts.mfaAt,
    });
    headers.cookie = `${COOKIE_NAME}=${token}`;
  }
  return new NextRequest('http://localhost:3000/api/v1/auth/mfa/totp/init', {
    headers,
  });
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  mocks.requireAdmin.mockReset();
  mocks.auditLog.mockReset();
  mocks.auditLog.mockResolvedValue(undefined);
  mocks.requireAdmin.mockResolvedValue(ADMIN_USER);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('hasRecentMfa', () => {
  it('sem cookie de sessao: false', () => {
    expect(hasRecentMfa(buildRequest({ noCookie: true }))).toBe(false);
  });

  it('cookie sem claim mfaAt: false', () => {
    expect(hasRecentMfa(buildRequest())).toBe(false);
  });

  it('mfaAt dentro da janela: true', () => {
    expect(hasRecentMfa(buildRequest({ mfaAt: nowSeconds() - 60 }))).toBe(true);
  });

  it('mfaAt fora da janela de 15 min: false', () => {
    const stale = nowSeconds() - MFA_RECENT_WINDOW_SECONDS - 1;
    expect(hasRecentMfa(buildRequest({ mfaAt: stale }))).toBe(false);
  });

  it('bypass de dev ligado: true mesmo sem mfaAt', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_MFA_DEV_BYPASS', 'true');
    expect(hasRecentMfa(buildRequest())).toBe(true);
  });

  it('flag true fora de development: false (fail-closed)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ADMIN_MFA_DEV_BYPASS', 'true');
    expect(hasRecentMfa(buildRequest())).toBe(false);
  });

  it('development sem a flag: false', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_MFA_DEV_BYPASS', 'false');
    expect(hasRecentMfa(buildRequest())).toBe(false);
  });
});

describe('rejectStaleMfa', () => {
  it('403 com code mfa_required, mensagem em pt-BR e AuditLog', async () => {
    const request = buildRequest();
    const response = await rejectStaleMfa(request, ADMIN_ID);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe(MFA_REQUIRED_CODE);
    expect(body.error).toBe(MFA_REQUIRED_MESSAGE);

    expect(mocks.auditLog).toHaveBeenCalledWith(
      'ADMIN_MFA_CHALLENGE_REQUIRED',
      { type: 'User', id: ADMIN_ID },
      ADMIN_ID,
      expect.objectContaining({ reason: 'mfa_stale_or_absent' }),
    );
  });

  it('falha de auditoria nao derruba a resposta 403', async () => {
    mocks.auditLog.mockRejectedValue(new Error('db down'));
    const response = await rejectStaleMfa(buildRequest(), ADMIN_ID);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe(MFA_REQUIRED_CODE);
  });
});

describe('requireAdminWithRecentMfa', () => {
  it('nao-admin: devolve a resposta de requireAdmin sem tocar em MFA', async () => {
    const denied = NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue(denied);

    const result = await requireAdminWithRecentMfa(
      buildRequest({ mfaAt: nowSeconds() }),
    );

    expect(result).toBe(denied);
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('admin sem mfaAt: 403 mfa_required', async () => {
    const result = await requireAdminWithRecentMfa(buildRequest());

    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe(MFA_REQUIRED_CODE);
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
  });

  it('admin com mfaAt antigo: 403 mfa_required', async () => {
    const stale = nowSeconds() - MFA_RECENT_WINDOW_SECONDS - 1;
    const result = await requireAdminWithRecentMfa(buildRequest({ mfaAt: stale }));

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });

  it('admin com mfaAt recente: devolve o usuario', async () => {
    const result = await requireAdminWithRecentMfa(
      buildRequest({ mfaAt: nowSeconds() - 10 }),
    );

    expect(result).toEqual(ADMIN_USER);
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('bypass de dev ligado: devolve o usuario mesmo sem mfaAt', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_MFA_DEV_BYPASS', 'true');

    const result = await requireAdminWithRecentMfa(buildRequest());

    expect(result).toEqual(ADMIN_USER);
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('bypass nao substitui a autenticacao admin', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_MFA_DEV_BYPASS', 'true');
    const denied = NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
    mocks.requireAdmin.mockResolvedValue(denied);

    const result = await requireAdminWithRecentMfa(buildRequest({ noCookie: true }));

    expect(result).toBe(denied);
  });
});
