// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// `@/lib/env` valida TODAS as env vars no import; semear antes de qualquer
// import de modulo (vi.hoisted roda antes das imports estaticas). As tres
// variaveis do fluxo OAuth entram aqui; o caso de config ausente usa
// mockImplementationOnce sobre getGoogleOAuthConfig.
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
    GOOGLE_CALENDAR_CLIENT_ID: 'client-id-teste',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret-teste',
    GOOGLE_CALENDAR_REDIRECT_URI: 'http://localhost:3000/api/v1/google/calendar/callback',
  });
});

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

import { AppError } from '@/lib/errors';
import * as oauthConfig from '@/lib/google/oauth-config';
import { verifyOAuthState } from '@/lib/google/oauth-state';
import { GET } from './route';

const ADMIN_ID = 'admin-1';

function buildRequest(opts: { role?: 'ADMIN' | 'STUDENT' } = {}) {
  const headers: Record<string, string> = {};
  if (opts.role !== undefined) {
    headers['x-user-id'] = ADMIN_ID;
    headers['x-user-role'] = opts.role ?? 'ADMIN';
    headers['x-token-version'] = '0';
  }
  return new NextRequest('http://localhost/api/v1/google/calendar/connect', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/v1/google/calendar/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'ADMIN', tokenVersion: 0 });
  });

  it('sem headers de sessao: 401', async () => {
    const res = await GET(buildRequest({}));
    expect(res.status).toBe(401);
  });

  it('role STUDENT: 403', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'STUDENT', tokenVersion: 0 });
    const res = await GET(buildRequest({ role: 'STUDENT' }));
    expect(res.status).toBe(403);
  });

  it('admin: 307 para o consentimento com escopo somente leitura, offline, consent e state valido', async () => {
    const res = await GET(buildRequest({ role: 'ADMIN' }));
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.readonly');
    expect(url.searchParams.get('scope')).not.toContain('calendar.events');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-id-teste');
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    expect(verifyOAuthState(state!)).toEqual({ userId: ADMIN_ID });
  });

  it('config ausente: 500 com code GOOGLE_CALENDAR_CONFIG_MISSING', async () => {
    vi.spyOn(oauthConfig, 'getGoogleOAuthConfig').mockImplementationOnce(() => {
      throw new AppError('GOOGLE_CALENDAR_CONFIG_MISSING', 'sem config', 500);
    });
    const res = await GET(buildRequest({ role: 'ADMIN' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('GOOGLE_CALENDAR_CONFIG_MISSING');
  });
});
