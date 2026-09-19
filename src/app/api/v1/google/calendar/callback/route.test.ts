// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
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
    GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret-sintetico-gap12-0000',
    GOOGLE_CALENDAR_REDIRECT_URI: 'http://localhost:3000/api/v1/google/calendar/callback',
  });
});

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  fetch: vi.fn(),
  createChannel: vi.fn(),
  encrypt: vi.fn<(plain: string) => string>(),
  // Referencia ao `encryptCredential` real, guardada pelo factory do mock parcial
  // abaixo (mecanismo de K8, hipotese H9 do GAP-12).
  cifragemReal: {
    encrypt: (_plain: string): string => {
      throw new Error('cifragem real nao carregada pelo factory');
    },
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { googleCalendarCredential: { upsert: mocks.upsert } },
}));

vi.mock('@/services/google-calendar-push.service', () => ({
  googleCalendarPushService: { createChannel: mocks.createChannel },
}));

// Mock parcial: `encryptCredential` vira espiao que delega ao real (K8 troca a
// implementacao por uma que lanca); `decryptCredential` segue o real.
vi.mock('@/lib/google/credential-crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/google/credential-crypto')>();
  mocks.cifragemReal.encrypt = real.encryptCredential;
  return { ...real, encryptCredential: mocks.encrypt };
});

import { decryptCredential } from '@/lib/google/credential-crypto';
import { logger } from '@/lib/logger';
import { signOAuthState } from '@/lib/google/oauth-state';
import { GET } from './route';

const ADMIN_ID = 'admin-1';
const READONLY = 'https://www.googleapis.com/auth/calendar.readonly';
// Sentinelas sinteticos do PR7 (GAP-12): nenhum valor real de token ou segredo.
const REFRESH_TOKEN = 'refresh-token-sintetico-gap12-0000';
const ACCESS_TOKEN = 'access-token-sintetico-gap12-0000';
const AUTH_CODE = 'auth-code-sintetico-gap12-0000';
const CLIENT_SECRET = 'client-secret-sintetico-gap12-0000';
const SENTINELAS = [REFRESH_TOKEN, ACCESS_TOKEN, AUTH_CODE, CLIENT_SECRET];
const EVENTO_TROCA_REJEITADA = 'google_calendar_callback_exchange_rejected';
const EVENTO_RESPOSTA_INVALIDA = 'google_calendar_callback_exchange_invalid_response';

const METODOS_CONSOLE = ['error', 'warn', 'info', 'log', 'debug'] as const;

/**
 * Coleta ampliada (K11): espiona os cinco metodos do console e devolve o
 * `JSON.stringify` de todas as chamadas feitas ate o momento da leitura.
 */
function coletarLogs(): () => string {
  const spies = METODOS_CONSOLE.map((metodo) =>
    vi.spyOn(console, metodo).mockImplementation(() => {}),
  );
  return () => JSON.stringify(spies.map((spy) => spy.mock.calls));
}

function buildRequest(query: Record<string, string>) {
  const url = new URL('http://localhost/api/v1/google/calendar/callback');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url.toString(), { method: 'GET' });
}

function okExchange(body: unknown) {
  mocks.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

/** Resposta de erro do endpoint de token, com corpo JSON. */
function failedExchange(status: number, body: unknown = {}) {
  mocks.fetch.mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  });
}

function expectGoogleCalendarRedirect(res: Response, params: Record<string, string>) {
  expect(res.status).toBe(307);
  const location = new URL(res.headers.get('location')!);
  // GAP-12: o resultado do consentimento aparece na tela da conexao, que
  // renderiza o banner a partir desses searchParams.
  expect(location.pathname).toBe('/admin/google-calendar');
  for (const [k, v] of Object.entries(params)) {
    expect(location.searchParams.get(k)).toBe(v);
  }
}

describe('GET /api/v1/google/calendar/callback', () => {
  let logs: () => string;
  let loggerError: MockInstance<typeof logger.error>;
  let loggerWarn: MockInstance<typeof logger.warn>;
  let state: string;

  /** Request do Google com code e state validos (o caminho que chega a troca). */
  function callbackRequest() {
    return buildRequest({ code: AUTH_CODE, state });
  }

  /**
   * Nenhum sentinela (refresh, access, code, client secret), nenhum state,
   * nenhum `refreshTokenEnc` produzido no teste e nenhum texto extra na coleta.
   */
  function esperarLogsLimpos(extras: string[] = []) {
    const coletado = logs();
    const cifrados = mocks.encrypt.mock.results
      .filter((r) => r.type === 'return')
      .map((r) => String(r.value));
    for (const proibido of [...SENTINELAS, state, ...cifrados, ...extras]) {
      expect(coletado).not.toContain(proibido);
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // stub dentro do beforeEach: o `server` do MSW (vitest.setup.ts) sobe em
    // beforeAll e re-patcheia o fetch global; stubbar no topo do modulo perde
    // para o interceptor. afterEach devolve o fetch do MSW aos demais arquivos.
    vi.stubGlobal('fetch', mocks.fetch);
    logs = coletarLogs();
    // Espioes sem mockImplementation: o logger real roda e escreve no console
    // espionado, entao a coleta ve a linha que iria para producao.
    loggerError = vi.spyOn(logger, 'error');
    loggerWarn = vi.spyOn(logger, 'warn');
    state = signOAuthState(ADMIN_ID);
    mocks.encrypt.mockImplementation((plain) => mocks.cifragemReal.encrypt(plain));
    mocks.upsert.mockResolvedValue({ id: 'cred-1', userId: ADMIN_ID });
    mocks.createChannel.mockResolvedValue({
      channelId: 'channel-1',
      resourceId: 'resource-1',
      expiration: new Date('2026-09-16T00:00:00Z'),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('error=access_denied: redirect sem chamar o Google', async () => {
    const res = await GET(buildRequest({ error: 'access_denied' }));
    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'access_denied' });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('state invalido: redirect invalid_state sem chamar o Google', async () => {
    const res = await GET(buildRequest({ code: AUTH_CODE, state: 'state-forjado' }));
    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'invalid_state' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('K1 falha de rede no exchange: redirect exchange_network_error em vez de 500', async () => {
    mocks.fetch.mockRejectedValue(new TypeError('fetch failed'));

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_network_error' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledTimes(1);
    // So nome do evento e contexto: nenhum objeto de erro vai ao logger.
    expect(loggerError.mock.calls[0]).toEqual([
      'google_calendar_callback_exchange_failed',
      { userId: ADMIN_ID, reason: 'exchange_network_error', errorName: 'TypeError' },
    ]);
    esperarLogsLimpos(['fetch failed']);
  });

  it('K2 troca 429: redirect exchange_rate_limited', async () => {
    failedExchange(429);

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_rate_limited' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(loggerWarn.mock.calls).toEqual([
      [
        EVENTO_TROCA_REJEITADA,
        { userId: ADMIN_ID, reason: 'exchange_rate_limited', status: 429, errorCode: null },
      ],
    ]);
    esperarLogsLimpos();
  });

  it('K3 troca 503: redirect exchange_upstream_error', async () => {
    failedExchange(503);

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_upstream_error' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(loggerWarn.mock.calls).toEqual([
      [
        EVENTO_TROCA_REJEITADA,
        { userId: ADMIN_ID, reason: 'exchange_upstream_error', status: 503, errorCode: null },
      ],
    ]);
    esperarLogsLimpos();
  });

  it('K4 troca 400 invalid_grant: redirect exchange_invalid_grant sem error_description no log', async () => {
    failedExchange(400, {
      error: 'invalid_grant',
      error_description: 'Bad Request descricao sintetica',
    });

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_invalid_grant' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(loggerWarn.mock.calls).toEqual([
      [
        EVENTO_TROCA_REJEITADA,
        {
          userId: ADMIN_ID,
          reason: 'exchange_invalid_grant',
          status: 400,
          errorCode: 'invalid_grant',
        },
      ],
    ]);
    esperarLogsLimpos(['Bad Request descricao sintetica', 'error_description']);
  });

  it('K5 exchange com 400: redirect exchange_failed', async () => {
    failedExchange(400, {});

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_failed' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    esperarLogsLimpos();
  });

  it('troca 400 com corpo ilegivel: redirect exchange_failed', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new SyntaxError('corpo de erro sintetico nao e JSON');
      },
    });

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_failed' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    esperarLogsLimpos(['corpo de erro sintetico nao e JSON']);
  });

  it('troca rejeitada: errorCode do log truncado em 64 caracteres', async () => {
    const codigoLongo = 'codigo_sintetico_'.repeat(12);
    failedExchange(401, { error: codigoLongo });

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_failed' });
    expect(loggerWarn.mock.calls).toEqual([
      [
        EVENTO_TROCA_REJEITADA,
        {
          userId: ADMIN_ID,
          reason: 'exchange_failed',
          status: 401,
          errorCode: codigoLongo.slice(0, 64),
        },
      ],
    ]);
    esperarLogsLimpos([codigoLongo.slice(0, 65)]);
  });

  it('K6 corpo ilegivel no exchange: redirect exchange_invalid_response em vez de 500', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('corpo sintetico nao e JSON');
      },
    });

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_invalid_response' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(loggerError.mock.calls).toEqual([
      [
        EVENTO_RESPOSTA_INVALIDA,
        { userId: ADMIN_ID, reason: 'exchange_invalid_response', errorName: 'SyntaxError' },
      ],
    ]);
    esperarLogsLimpos(['corpo sintetico nao e JSON']);
  });

  it('K7 troca 200 com corpo null: redirect exchange_invalid_response', async () => {
    okExchange(null);

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'exchange_invalid_response' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(loggerError.mock.calls).toEqual([
      [
        EVENTO_RESPOSTA_INVALIDA,
        { userId: ADMIN_ID, reason: 'exchange_invalid_response', bodyType: 'null' },
      ],
    ]);
    esperarLogsLimpos();
  });

  it('K8 cifragem falha: redirect credential_encrypt_failed sem upsert nem canal', async () => {
    okExchange({ scope: READONLY, refresh_token: REFRESH_TOKEN, access_token: ACCESS_TOKEN });
    mocks.encrypt.mockImplementationOnce(() => {
      throw new Error('cifragem sintetica');
    });

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'credential_encrypt_failed' });
    expect(mocks.encrypt).toHaveBeenCalledWith(REFRESH_TOKEN);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.createChannel).not.toHaveBeenCalled();
    expect(loggerError.mock.calls).toEqual([
      [
        'google_calendar_callback_credential_encrypt_failed',
        { userId: ADMIN_ID, reason: 'credential_encrypt_failed', errorName: 'Error' },
      ],
    ]);
    esperarLogsLimpos(['cifragem sintetica']);
  });

  it('K9 upsert falha: redirect credential_persist_failed sem criar canal', async () => {
    okExchange({ scope: READONLY, refresh_token: REFRESH_TOKEN, access_token: ACCESS_TOKEN });
    mocks.upsert.mockRejectedValue(new Error('P1001 sintetico'));

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'credential_persist_failed' });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.createChannel).not.toHaveBeenCalled();
    expect(loggerError.mock.calls).toEqual([
      [
        'google_calendar_callback_credential_persist_failed',
        {
          userId: ADMIN_ID,
          reason: 'credential_persist_failed',
          errorName: 'Error',
          errorCode: null,
        },
      ],
    ]);
    esperarLogsLimpos(['P1001 sintetico']);
  });

  it('K9 upsert falha com code Prisma: log leva o code, nunca a message', async () => {
    okExchange({ scope: READONLY, refresh_token: REFRESH_TOKEN });
    mocks.upsert.mockRejectedValue(
      Object.assign(new Error('banco sintetico inalcancavel'), { code: 'P1001' }),
    );

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'credential_persist_failed' });
    expect(mocks.createChannel).not.toHaveBeenCalled();
    expect(loggerError.mock.calls).toEqual([
      [
        'google_calendar_callback_credential_persist_failed',
        {
          userId: ADMIN_ID,
          reason: 'credential_persist_failed',
          errorName: 'Error',
          errorCode: 'P1001',
        },
      ],
    ]);
    esperarLogsLimpos(['banco sintetico inalcancavel']);
  });

  it('scope com escrita: redirect scope_rejected SEM escrita em banco', async () => {
    okExchange({
      scope: `${READONLY} https://www.googleapis.com/auth/calendar.events`,
      refresh_token: REFRESH_TOKEN,
      access_token: ACCESS_TOKEN,
    });
    const res = await GET(callbackRequest());
    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'scope_rejected' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    esperarLogsLimpos();
  });

  it('scope de leitura-escrita cheio: rejeitado mesmo contendo substring de leitura', async () => {
    okExchange({
      scope: 'https://www.googleapis.com/auth/calendar',
      refresh_token: REFRESH_TOKEN,
    });
    const res = await GET(callbackRequest());
    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'scope_rejected' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    esperarLogsLimpos();
  });

  it('sem refresh_token: redirect missing_refresh_token', async () => {
    okExchange({ scope: READONLY, access_token: ACCESS_TOKEN });
    const res = await GET(callbackRequest());
    expectGoogleCalendarRedirect(res, { google: 'error', reason: 'missing_refresh_token' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    esperarLogsLimpos();
  });

  it('sucesso: upsert cifrado, access_token fora do banco, redirect connected', async () => {
    okExchange({
      scope: READONLY,
      refresh_token: REFRESH_TOKEN,
      access_token: ACCESS_TOKEN,
      expires_in: 3600,
    });
    const res = await GET(callbackRequest());
    expectGoogleCalendarRedirect(res, { google: 'connected' });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const arg = mocks.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: ADMIN_ID });
    expect(arg.create.refreshTokenEnc).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(arg.create.refreshTokenEnc).not.toBe(REFRESH_TOKEN);
    expect(decryptCredential(arg.create.refreshTokenEnc)).toBe(REFRESH_TOKEN);
    expect(mocks.createChannel).toHaveBeenCalledWith(ADMIN_ID);
    // access_token nunca chega ao upsert
    const serial = JSON.stringify(arg);
    expect(serial).not.toContain(ACCESS_TOKEN);
    esperarLogsLimpos();
  });

  it('K10a falha no canal preserva credencial e sinaliza channel=pending', async () => {
    okExchange({ scope: READONLY, refresh_token: REFRESH_TOKEN });
    mocks.createChannel.mockRejectedValue(new Error('watch indisponivel'));

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'connected', channel: 'pending' });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    esperarLogsLimpos(['watch indisponivel']);
  });

  it('K10b falha no canal: logger.warn channelProvision=pending sem a message do erro', async () => {
    okExchange({ scope: READONLY, refresh_token: REFRESH_TOKEN, access_token: ACCESS_TOKEN });
    mocks.createChannel.mockRejectedValue(new Error('watch indisponivel'));

    await GET(callbackRequest());

    expect(loggerWarn.mock.calls).toEqual([
      [
        'google_calendar_callback_channel_pending',
        { userId: ADMIN_ID, channelProvision: 'pending', errorName: 'Error' },
      ],
    ]);
    expect(loggerError).not.toHaveBeenCalled();
    esperarLogsLimpos(['watch indisponivel']);
  });

  it('K11 nenhum caminho loga refresh, access, code, client secret ou state em claro', async () => {
    okExchange({
      scope: READONLY,
      refresh_token: REFRESH_TOKEN,
      access_token: ACCESS_TOKEN,
      id_token: 'id-token-sintetico-gap12',
      expires_in: 3600,
    });

    const res = await GET(callbackRequest());

    expectGoogleCalendarRedirect(res, { google: 'connected' });
    // Os sentinelas de fato percorreram o caminho: code e client secret no
    // corpo da troca, refresh token cifrado no upsert.
    const corpoTroca = String(mocks.fetch.mock.calls[0][1].body);
    expect(corpoTroca).toContain(AUTH_CODE);
    expect(corpoTroca).toContain(CLIENT_SECRET);
    expect(mocks.encrypt).toHaveBeenCalledWith(REFRESH_TOKEN);
    esperarLogsLimpos(['id-token-sintetico-gap12']);
  });
});
