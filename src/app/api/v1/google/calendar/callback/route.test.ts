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
  upsert: vi.fn(),
  fetch: vi.fn(),
  createChannel: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { googleCalendarCredential: { upsert: mocks.upsert } },
}));

vi.mock('@/services/google-calendar-push.service', () => ({
  googleCalendarPushService: { createChannel: mocks.createChannel },
}));

import { afterEach } from 'vitest';
import { decryptCredential } from '@/lib/google/credential-crypto';
import { signOAuthState } from '@/lib/google/oauth-state';
import { GET } from './route';

const ADMIN_ID = 'admin-1';
const READONLY = 'https://www.googleapis.com/auth/calendar.readonly';
const REFRESH_TOKEN = 'refresh-token-falso-de-teste';

function buildRequest(query: Record<string, string>) {
  const url = new URL('http://localhost/api/v1/google/calendar/callback');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET' });
}

function okExchange(body: Record<string, unknown>) {
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

function expectScheduleRedirect(res: Response, params: Record<string, string>) {
  expect(res.status).toBe(307);
  const location = new URL(res.headers.get('location')!);
  expect(location.pathname).toBe('/admin/schedule');
  for (const [k, v] of Object.entries(params)) {
    expect(location.searchParams.get(k)).toBe(v);
  }
}

describe('GET /api/v1/google/calendar/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // stub dentro do beforeEach: o `server` do MSW (vitest.setup.ts) sobe em
    // beforeAll e re-patcheia o fetch global; stubbar no topo do modulo perde
    // para o interceptor. afterEach devolve o fetch do MSW aos demais arquivos.
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.upsert.mockResolvedValue({ id: 'cred-1', userId: ADMIN_ID });
    mocks.createChannel.mockResolvedValue({
      channelId: 'channel-1',
      resourceId: 'resource-1',
      expiration: new Date('2026-09-16T00:00:00Z'),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('error=access_denied: redirect sem chamar o Google', async () => {
    const res = await GET(buildRequest({ error: 'access_denied' }));
    expectScheduleRedirect(res, { google: 'error', reason: 'access_denied' });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('state invalido: redirect invalid_state sem chamar o Google', async () => {
    const res = await GET(buildRequest({ code: 'x', state: 'state-forjado' }));
    expectScheduleRedirect(res, { google: 'error', reason: 'invalid_state' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('exchange com 400: redirect exchange_failed', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    const res = await GET(buildRequest({ code: 'x', state: signOAuthState(ADMIN_ID) }));
    expectScheduleRedirect(res, { google: 'error', reason: 'exchange_failed' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('scope com escrita: redirect scope_rejected SEM escrita em banco', async () => {
    okExchange({
      scope: `${READONLY} https://www.googleapis.com/auth/calendar.events`,
      refresh_token: REFRESH_TOKEN,
      access_token: 'access-descartavel',
    });
    const res = await GET(buildRequest({ code: 'x', state: signOAuthState(ADMIN_ID) }));
    expectScheduleRedirect(res, { google: 'error', reason: 'scope_rejected' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('scope de leitura-escrita cheio: rejeitado mesmo contendo substring de leitura', async () => {
    okExchange({
      scope: 'https://www.googleapis.com/auth/calendar',
      refresh_token: REFRESH_TOKEN,
    });
    const res = await GET(buildRequest({ code: 'x', state: signOAuthState(ADMIN_ID) }));
    expectScheduleRedirect(res, { google: 'error', reason: 'scope_rejected' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('sem refresh_token: redirect missing_refresh_token', async () => {
    okExchange({ scope: READONLY, access_token: 'access-descartavel' });
    const res = await GET(buildRequest({ code: 'x', state: signOAuthState(ADMIN_ID) }));
    expectScheduleRedirect(res, { google: 'error', reason: 'missing_refresh_token' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('sucesso: upsert cifrado, access_token fora do banco, redirect connected', async () => {
    okExchange({
      scope: READONLY,
      refresh_token: REFRESH_TOKEN,
      access_token: 'access-token-que-nao-pode-vazar',
      expires_in: 3600,
    });
    const res = await GET(buildRequest({ code: 'x', state: signOAuthState(ADMIN_ID) }));
    expectScheduleRedirect(res, { google: 'connected' });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const arg = mocks.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: ADMIN_ID });
    expect(arg.create.refreshTokenEnc).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(arg.create.refreshTokenEnc).not.toBe(REFRESH_TOKEN);
    expect(decryptCredential(arg.create.refreshTokenEnc)).toBe(REFRESH_TOKEN);
    expect(mocks.createChannel).toHaveBeenCalledWith(ADMIN_ID);
    // access_token nunca chega ao upsert
    const serial = JSON.stringify(arg);
    expect(serial).not.toContain('access-token-que-nao-pode-vazar');
  });

  it('falha no canal preserva credencial e sinaliza channel=pending', async () => {
    okExchange({ scope: READONLY, refresh_token: REFRESH_TOKEN });
    mocks.createChannel.mockRejectedValue(new Error('watch indisponivel'));

    const res = await GET(buildRequest({ code: 'x', state: signOAuthState(ADMIN_ID) }));

    expectScheduleRedirect(res, { google: 'connected', channel: 'pending' });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it('nenhum caminho loga o refresh token em claro', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    okExchange({ scope: READONLY, refresh_token: REFRESH_TOKEN });
    await GET(buildRequest({ code: 'x', state: signOAuthState(ADMIN_ID) }));
    for (const spy of [errorSpy, logSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(REFRESH_TOKEN);
      }
    }
    errorSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('falha ao criar canal mantem OAuth e sinaliza channel=pending', async () => {
    okExchange({ scope: READONLY, refresh_token: REFRESH_TOKEN });
    mocks.createChannel.mockRejectedValue(new Error('watch indisponivel'));

    const res = await GET(buildRequest({ code: 'x', state: signOAuthState(ADMIN_ID) }));

    expectScheduleRedirect(res, { google: 'connected', channel: 'pending' });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});
