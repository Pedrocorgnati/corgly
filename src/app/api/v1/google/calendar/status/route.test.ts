// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
  credentialFindUnique: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    googleCalendarCredential: { findUnique: mocks.credentialFindUnique },
  },
}));

import { googleCalendarStatusSchema } from '@/app/(admin)/admin/google-calendar/google-calendar-status.contract';
import { encryptCredential } from '@/lib/google/credential-crypto';
import { GET } from './route';

const ADMIN_ID = 'admin-1';
const REFRESH_TOKEN = 'refresh-token-falso-de-teste';
const CREDENTIAL = {
  id: 'cred-1',
  userId: ADMIN_ID,
  refreshTokenEnc: encryptCredential(REFRESH_TOKEN),
  scope: 'https://www.googleapis.com/auth/calendar.readonly',
  connectedAt: new Date('2026-09-01T12:00:00.000Z'),
  lastSyncAt: new Date('2026-09-05T08:30:00.000Z'),
};

function buildRequest(opts: { role?: 'ADMIN' | 'STUDENT'; headers?: boolean } = {}) {
  if (opts.headers === false) {
    return new NextRequest('http://localhost/api/v1/google/calendar/status', { method: 'GET' });
  }
  return new NextRequest('http://localhost/api/v1/google/calendar/status', {
    method: 'GET',
    headers: {
      'x-user-id': ADMIN_ID,
      'x-user-role': opts.role ?? 'ADMIN',
      'x-token-version': '0',
    },
  });
}

describe('GET /api/v1/google/calendar/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // stub dentro do beforeEach: o `server` do MSW (vitest.setup.ts) sobe em
    // beforeAll e re-patcheia o fetch global; stubbar no topo do modulo perde
    // para o interceptor. afterEach devolve o fetch do MSW aos demais arquivos.
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'ADMIN', tokenVersion: 0 });
    mocks.credentialFindUnique.mockResolvedValue(CREDENTIAL);
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'access-token-descartavel' }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem headers de sessao: 401', async () => {
    const res = await GET(buildRequest({ headers: false }));
    expect(res.status).toBe(401);
    expect(mocks.credentialFindUnique).not.toHaveBeenCalled();
  });

  it('role STUDENT: 403', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'STUDENT', tokenVersion: 0 });
    const res = await GET(buildRequest({ role: 'STUDENT' }));
    expect(res.status).toBe(403);
    expect(mocks.credentialFindUnique).not.toHaveBeenCalled();
  });

  it('sem credencial: disconnected com os demais campos null, sem chamar o Google', async () => {
    mocks.credentialFindUnique.mockResolvedValue(null);
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data).toEqual({
      state: 'disconnected',
      connectedAt: null,
      lastSuccessfulSyncAt: null,
      scope: null,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refresh token valido no Google: connected com connectedAt, scope e carimbo real de sync', async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.state).toBe('connected');
    expect(body.data.connectedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(body.data.scope).toBe(CREDENTIAL.scope);
    // Carimbo real vindo de GoogleCalendarCredential.lastSyncAt (GAP-10),
    // nao mais null fixo.
    expect(body.data.lastSuccessfulSyncAt).toBe('2026-09-05T08:30:00.000Z');

    const [calledUrl, calledInit] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://oauth2.googleapis.com/token');
    expect(calledInit.method).toBe('POST');
    const sentBody = String(calledInit.body);
    expect(sentBody).toContain('grant_type=refresh_token');
    expect(sentBody).toContain(encodeURIComponent(REFRESH_TOKEN));
    // access_token descartado em memoria: nao vaza para o payload.
    expect(JSON.stringify(body)).not.toContain('access-token-descartavel');
  });

  it('invalid_grant do Google: expired, credencial local NAO removida e carimbo real preservado', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.state).toBe('expired');
    expect(body.data.connectedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(body.data.scope).toBe(CREDENTIAL.scope);
    // GAP-10: carimbo da ultima sincronizacao bem-sucedida continua visivel
    // mesmo expirada — a tela distingue "nunca sincronizou" de "sync antiga".
    expect(body.data.lastSuccessfulSyncAt).toBe('2026-09-05T08:30:00.000Z');
  });

  it('connected sem nenhuma sincronizacao concluida: carimbo null', async () => {
    mocks.credentialFindUnique.mockResolvedValue({
      ...CREDENTIAL,
      lastSyncAt: null,
    });
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.state).toBe('connected');
    expect(body.data.lastSuccessfulSyncAt).toBeNull();
  });

  it('5xx do Google na verificacao: 502 com codigo rastreavel', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const res = await GET(buildRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.data).toBeNull();
    expect(body.code).toBe('GOOGLE_CALENDAR_STATUS_CHECK_FAILED');
  });

  it('falha de rede na verificacao: 502 com codigo rastreavel', async () => {
    mocks.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await GET(buildRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GOOGLE_CALENDAR_STATUS_CHECK_FAILED');
  });

  it('payload valida no contrato isomorfico', async () => {
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(googleCalendarStatusSchema.safeParse(body.data).success).toBe(true);
  });

  it('refresh token em claro nunca vai a logs nem ao payload', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(REFRESH_TOKEN);
    for (const spy of [errorSpy, logSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(REFRESH_TOKEN);
      }
    }
    errorSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
