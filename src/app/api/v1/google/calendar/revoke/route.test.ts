// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  credentialDelete: vi.fn(),
  auditLog: vi.fn(),
  fetch: vi.fn(),
  stopCurrentChannel: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    googleCalendarCredential: {
      findUnique: mocks.credentialFindUnique,
      delete: mocks.credentialDelete,
    },
  },
}));

vi.mock('@/lib/audit/audit-logger', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/services/google-calendar-push.service', () => ({
  googleCalendarPushService: { stopCurrentChannel: mocks.stopCurrentChannel },
}));

import { afterEach } from 'vitest';
import { encryptCredential } from '@/lib/google/credential-crypto';
import { POST } from './route';

const ADMIN_ID = 'admin-1';
const REFRESH_TOKEN = 'refresh-token-falso-de-teste';
const CREDENTIAL = {
  id: 'cred-1',
  userId: ADMIN_ID,
  refreshTokenEnc: encryptCredential(REFRESH_TOKEN),
  scope: 'https://www.googleapis.com/auth/calendar.readonly',
};

function buildRequest(opts: { role?: 'ADMIN' | 'STUDENT'; headers?: boolean } = {}) {
  if (opts.headers === false) {
    return new NextRequest('http://localhost/api/v1/google/calendar/revoke', { method: 'POST' });
  }
  return new NextRequest('http://localhost/api/v1/google/calendar/revoke', {
    method: 'POST',
    headers: {
      'x-user-id': ADMIN_ID,
      'x-user-role': opts.role ?? 'ADMIN',
      'x-token-version': '0',
    },
  });
}

describe('POST /api/v1/google/calendar/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // stub dentro do beforeEach: o `server` do MSW (vitest.setup.ts) sobe em
    // beforeAll e re-patcheia o fetch global; stubbar no topo do modulo perde
    // para o interceptor. afterEach devolve o fetch do MSW aos demais arquivos.
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'ADMIN', tokenVersion: 0 });
    mocks.credentialFindUnique.mockResolvedValue(CREDENTIAL);
    mocks.credentialDelete.mockResolvedValue(CREDENTIAL);
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    mocks.stopCurrentChannel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem headers de sessao: 401', async () => {
    const res = await POST(buildRequest({ headers: false }));
    expect(res.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('role STUDENT: 403', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'STUDENT', tokenVersion: 0 });
    const res = await POST(buildRequest({ role: 'STUDENT' }));
    expect(res.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('sem credencial: 404 sem chamar o Google', async () => {
    mocks.credentialFindUnique.mockResolvedValue(null);
    const res = await POST(buildRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Nenhuma conexao Google ativa.');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('sucesso: revoga no Google com o token no CORPO do POST, para o canal depois, remove a linha e audita sem segredo', async () => {
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(url).not.toContain('?token=');
    expect(url).not.toContain(REFRESH_TOKEN);
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain(`token=${encodeURIComponent(REFRESH_TOKEN)}`);
    expect(mocks.credentialDelete).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'GOOGLE_CALENDAR_DISCONNECTED',
      { type: 'GoogleCalendarCredential', id: 'cred-1' },
      ADMIN_ID,
      expect.objectContaining({ scope: CREDENTIAL.scope, channelStop: 'stopped' }),
    );
    const auditSerial = JSON.stringify(mocks.auditLog.mock.calls);
    expect(auditSerial).not.toContain(REFRESH_TOKEN);
  });

  it('invalid_token (ja revogado no Google): tambem remove a linha', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_token' }) });
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(mocks.credentialDelete).toHaveBeenCalled();
  });

  it('5xx do Google: 502 e a credencial local permanece', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    expect(mocks.credentialDelete).not.toHaveBeenCalled();
  });

  it('falha de rede: 502 e a credencial local permanece', async () => {
    mocks.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    expect(mocks.credentialDelete).not.toHaveBeenCalled();
  });

  it('token em claro nunca vai a logs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await POST(buildRequest());
    for (const spy of [errorSpy, logSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(REFRESH_TOKEN);
      }
    }
    errorSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('ordem do GAP-12: revoga OAuth ANTES de parar o canal e de apagar a credencial', async () => {
    mocks.credentialFindUnique.mockResolvedValue({
      ...CREDENTIAL,
      channelId: 'channel-1',
      resourceId: 'resource-1',
    });
    const order: string[] = [];
    mocks.stopCurrentChannel.mockImplementation(async () => { order.push('stop'); });
    mocks.fetch.mockImplementation(async () => {
      order.push('oauth');
      return { ok: true, json: async () => ({}) };
    });
    mocks.credentialDelete.mockImplementation(async () => {
      order.push('delete');
      return CREDENTIAL;
    });

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(order).toEqual(['oauth', 'stop', 'delete']);
  });

  it('falha transitoria no stop DEPOIS da revogacao: nao devolve 502, remove a credencial e registra o ocorrido (GAP-12)', async () => {
    mocks.credentialFindUnique.mockResolvedValue({
      ...CREDENTIAL,
      channelId: 'channel-1',
      resourceId: 'resource-1',
    });
    mocks.stopCurrentChannel.mockRejectedValue(new Error('Google 503'));

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.credentialDelete).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'GOOGLE_CALENDAR_DISCONNECTED',
      expect.anything(),
      ADMIN_ID,
      expect.objectContaining({ channelStop: 'failed-after-revoke' }),
    );
  });
});
