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

import { AppError } from '@/lib/errors';
import { encryptCredential } from '@/lib/google/credential-crypto';
import { logger } from '@/lib/logger';
import { POST } from './route';

const ADMIN_ID = 'admin-1';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
// Sentinelas sinteticos do PR7 (GAP-12): nenhum valor real de token ou segredo.
const REFRESH_TOKEN = 'refresh-token-sintetico-gap12-0000';
const CLIENT_SECRET = 'client-secret-sintetico-gap12-0000';
const SENTINELAS = [REFRESH_TOKEN, CLIENT_SECRET];
const CHANNEL_EXPIRATION = new Date('2026-09-26T12:00:00.000Z');
const MSG_REVOGADA = 'Conexao com o Google revogada.';
const MSG_NAO_CONFIRMOU = 'O Google nao confirmou a revogacao. Tente novamente.';
const CREDENTIAL = {
  id: 'cred-1',
  userId: ADMIN_ID,
  refreshTokenEnc: encryptCredential(REFRESH_TOKEN),
  scope: 'https://www.googleapis.com/auth/calendar.readonly',
  channelId: null as string | null,
  resourceId: null as string | null,
  channelExpiration: null as Date | null,
};
const CREDENTIAL_COM_CANAL = {
  ...CREDENTIAL,
  channelId: 'channel-sintetico',
  resourceId: 'resource-sintetico',
  channelExpiration: CHANNEL_EXPIRATION,
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

/** Resposta fabricada do endpoint de revogacao, no formato que o helper le. */
function resposta(status: number, corpo: unknown = {}, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
    text: async () => JSON.stringify(corpo),
    headers: new Headers(headers),
  };
}

/** Resposta cujo corpo nao e JSON: `json()` rejeita com SyntaxError. */
function respostaSemJson(status: number) {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
    text: async () => '<html>erro</html>',
    headers: new Headers(),
  };
}

const METODOS_CONSOLE = ['error', 'warn', 'info', 'log', 'debug'] as const;

/**
 * Coleta ampliada (R13): espiona os cinco metodos do console e devolve o
 * `JSON.stringify` de todas as chamadas feitas ate o momento da leitura.
 */
function coletarLogs(): () => string {
  const spies = METODOS_CONSOLE.map((metodo) =>
    vi.spyOn(console, metodo).mockImplementation(() => {}),
  );
  return () => JSON.stringify(spies.map((spy) => spy.mock.calls));
}

describe('POST /api/v1/google/calendar/revoke', () => {
  let logs: () => string;
  let loggerError: MockInstance<typeof logger.error>;
  let loggerWarn: MockInstance<typeof logger.warn>;

  /** Nenhum sentinela, nenhum `refreshTokenEnc` e nenhum texto extra na coleta. */
  function esperarLogsLimpos(extras: string[] = []) {
    const coletado = logs();
    for (const proibido of [...SENTINELAS, CREDENTIAL.refreshTokenEnc, ...extras]) {
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
    mocks.userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'ADMIN', tokenVersion: 0 });
    mocks.credentialFindUnique.mockResolvedValue(CREDENTIAL);
    mocks.credentialDelete.mockResolvedValue(CREDENTIAL);
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue(resposta(200));
    mocks.stopCurrentChannel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('R1 e R16: sucesso sem canal revoga com o token no CORPO form, remove a linha e audita revokeResult e channelStop none', async () => {
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null, error: null, message: MSG_REVOGADA });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(REVOKE_URL);
    expect(url).not.toContain('?');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(`token=${REFRESH_TOKEN}`);
    expect(new Headers(init.headers).get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(mocks.stopCurrentChannel).not.toHaveBeenCalled();
    expect(mocks.credentialDelete).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'GOOGLE_CALENDAR_DISCONNECTED',
      { type: 'GoogleCalendarCredential', id: 'cred-1' },
      ADMIN_ID,
      { scope: CREDENTIAL.scope, revokeResult: 'revoked', channelStop: 'none' },
    );
    const auditSerial = JSON.stringify(mocks.auditLog.mock.calls);
    expect(auditSerial).not.toContain(REFRESH_TOKEN);
    esperarLogsLimpos();
  });

  it('R16: sucesso com canal para o canal, remove a linha e audita channelStop stopped', async () => {
    mocks.credentialFindUnique.mockResolvedValue(CREDENTIAL_COM_CANAL);
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null, error: null, message: MSG_REVOGADA });
    expect(mocks.stopCurrentChannel).toHaveBeenCalledWith(ADMIN_ID);
    expect(mocks.credentialDelete).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'GOOGLE_CALENDAR_DISCONNECTED',
      { type: 'GoogleCalendarCredential', id: 'cred-1' },
      ADMIN_ID,
      { scope: CREDENTIAL.scope, revokeResult: 'revoked', channelStop: 'stopped' },
    );
    esperarLogsLimpos();
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
    await POST(buildRequest());
    esperarLogsLimpos();
  });

  it.each(['nao-e-um-cifrado', '00:00:00'])(
    'R2: refreshTokenEnc ilegivel (%s) responde 500 GOOGLE_CREDENTIAL_UNREADABLE sem parar canal, revogar nem remover',
    async (refreshTokenEnc) => {
      mocks.credentialFindUnique.mockResolvedValue({ ...CREDENTIAL_COM_CANAL, refreshTokenEnc });
      const res = await POST(buildRequest());
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.code).toBe('GOOGLE_CREDENTIAL_UNREADABLE');
      expect(body.error).toBe(
        'Nao foi possivel ler a credencial do Google. Reconecte a agenda e tente novamente.',
      );
      expect(mocks.stopCurrentChannel).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.credentialDelete).not.toHaveBeenCalled();
      expect(mocks.auditLog).not.toHaveBeenCalled();
      expect(loggerError).toHaveBeenCalledWith('google_calendar_revoke_credential_unreadable', {
        userId: ADMIN_ID,
        credentialId: 'cred-1',
      });
      expect(JSON.stringify(loggerError.mock.calls)).not.toContain(refreshTokenEnc);
      // A coleta ve a linha real do logger: a afirmacao negativa abaixo nao e vazia.
      expect(logs()).toContain('google_calendar_revoke_credential_unreadable');
      esperarLogsLimpos(['GOOGLE_CREDENTIAL_MALFORMED', 'channel-sintetico', 'resource-sintetico']);
    },
  );

  it('R3: revoke 400 invalid_grant responde 200, remove a linha e audita revokeResult already_invalid', async () => {
    mocks.fetch.mockResolvedValue(resposta(400, { error: 'invalid_grant' }));
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(mocks.credentialDelete).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'GOOGLE_CALENDAR_DISCONNECTED',
      { type: 'GoogleCalendarCredential', id: 'cred-1' },
      ADMIN_ID,
      { scope: CREDENTIAL.scope, revokeResult: 'already_invalid', channelStop: 'none' },
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: ADMIN_ID, errorCode: 'invalid_grant' }),
    );
    esperarLogsLimpos();
  });

  it('R4: revoke 429 com retry-after 30 responde 502 RATE_LIMITED com Retry-After e mantem a credencial', async () => {
    mocks.fetch.mockResolvedValue(resposta(429, {}, { 'retry-after': '30' }));
    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body.code).toBe('GOOGLE_CALENDAR_REVOKE_RATE_LIMITED');
    expect(body.error).toBe(
      'O Google limitou as tentativas. Aguarde alguns instantes e tente novamente.',
    );
    expect(mocks.credentialDelete).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: ADMIN_ID, retryAfterSeconds: 30 }),
    );
    esperarLogsLimpos();
  });

  it('R4: revoke 429 sem retry-after responde 502 RATE_LIMITED sem header Retry-After', async () => {
    mocks.fetch.mockResolvedValue(resposta(429));
    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    expect(res.headers.get('Retry-After')).toBeNull();
    const body = await res.json();
    expect(body.code).toBe('GOOGLE_CALENDAR_REVOKE_RATE_LIMITED');
    expect(mocks.credentialDelete).not.toHaveBeenCalled();
    esperarLogsLimpos();
  });

  it('R5b: revoke 503 responde 502 UPSTREAM_ERROR e loga status 503', async () => {
    mocks.fetch.mockResolvedValue(resposta(503));
    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GOOGLE_CALENDAR_REVOKE_UPSTREAM_ERROR');
    expect(body.error).toBe(MSG_NAO_CONFIRMOU);
    expect(mocks.credentialDelete).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: ADMIN_ID, status: 503 }),
    );
    esperarLogsLimpos();
  });

  it('R6b: fetch rejeita com TypeError responde 502 NETWORK_ERROR e loga so o nome do erro', async () => {
    mocks.fetch.mockRejectedValue(new TypeError('fetch failed'));
    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GOOGLE_CALENDAR_REVOKE_NETWORK_ERROR');
    expect(body.error).toBe('Nao foi possivel falar com o Google. Tente novamente.');
    expect(mocks.credentialDelete).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: ADMIN_ID, errorName: 'TypeError' }),
    );
    esperarLogsLimpos(['fetch failed']);
  });

  it('R7: revoke 400 com corpo nao JSON responde 502 INVALID_RESPONSE e mantem a credencial', async () => {
    mocks.fetch.mockResolvedValue(respostaSemJson(400));
    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GOOGLE_CALENDAR_REVOKE_INVALID_RESPONSE');
    expect(body.error).toBe(MSG_NAO_CONFIRMOU);
    expect(mocks.credentialDelete).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: ADMIN_ID, status: 400 }),
    );
    esperarLogsLimpos(['Unexpected token', '<html>']);
  });

  it('R8: revoke 400 unsupported_token_type responde 502 REJECTED e mantem a credencial', async () => {
    mocks.fetch.mockResolvedValue(resposta(400, { error: 'unsupported_token_type' }));
    const res = await POST(buildRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('GOOGLE_CALENDAR_REVOKE_REJECTED');
    expect(body.error).toBe(MSG_NAO_CONFIRMOU);
    expect(mocks.credentialDelete).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: ADMIN_ID, status: 400, errorCode: 'unsupported_token_type' }),
    );
    esperarLogsLimpos();
  });

  it('R10: stop com refresh token invalido segue para a revogacao e audita skipped_token_invalid', async () => {
    mocks.credentialFindUnique.mockResolvedValue(CREDENTIAL_COM_CANAL);
    mocks.stopCurrentChannel.mockRejectedValue(
      new AppError('GOOGLE_REFRESH_TOKEN_INVALID', 'sintetico', 401),
    );
    mocks.fetch.mockResolvedValue(resposta(400, { error: 'invalid_grant' }));
    const res = await POST(buildRequest());
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(mocks.credentialDelete).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'GOOGLE_CALENDAR_DISCONNECTED',
      { type: 'GoogleCalendarCredential', id: 'cred-1' },
      ADMIN_ID,
      { scope: CREDENTIAL.scope, revokeResult: 'already_invalid', channelStop: 'skipped_token_invalid' },
    );
    expect(loggerWarn).toHaveBeenCalledWith('google_calendar_revoke_channel_stop_skipped', {
      userId: ADMIN_ID,
      channelStop: 'skipped_token_invalid',
    });
    esperarLogsLimpos(['sintetico']);
  });

  it('R12: canal pendente sem resourceId nao chama o stop, revoga e audita pending_skipped', async () => {
    mocks.credentialFindUnique.mockResolvedValue({
      ...CREDENTIAL,
      channelId: 'channel-sintetico',
      resourceId: null,
    });
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(mocks.stopCurrentChannel).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.credentialDelete).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'GOOGLE_CALENDAR_DISCONNECTED',
      { type: 'GoogleCalendarCredential', id: 'cred-1' },
      ADMIN_ID,
      { scope: CREDENTIAL.scope, revokeResult: 'revoked', channelStop: 'pending_skipped' },
    );
    expect(loggerWarn).toHaveBeenCalledWith('google_calendar_revoke_channel_pending_skipped', {
      userId: ADMIN_ID,
      channelStop: 'pending_skipped',
    });
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain('channelId');
    esperarLogsLimpos(['channel-sintetico']);
  });

  it('R14: ordem do GAP-12: para o canal, depois revoga OAuth, depois apaga a credencial', async () => {
    mocks.credentialFindUnique.mockResolvedValue(CREDENTIAL_COM_CANAL);
    const order: string[] = [];
    mocks.stopCurrentChannel.mockImplementation(async () => { order.push('stop'); });
    mocks.fetch.mockImplementation(async () => {
      order.push('oauth');
      return resposta(200);
    });
    mocks.credentialDelete.mockImplementation(async () => {
      order.push('delete');
      return CREDENTIAL;
    });

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(order).toEqual(['stop', 'oauth', 'delete']);
  });

  it('R11a (ST005 opcao 3): falha transitoria no stop nao encerra antes da revogacao, remove a credencial e audita failed_orphaned com channelExpiration', async () => {
    mocks.credentialFindUnique.mockResolvedValue(CREDENTIAL_COM_CANAL);
    mocks.stopCurrentChannel.mockRejectedValue(new Error('Google 503'));

    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(mocks.stopCurrentChannel).toHaveBeenCalledWith(ADMIN_ID);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.credentialDelete).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      'GOOGLE_CALENDAR_DISCONNECTED',
      { type: 'GoogleCalendarCredential', id: 'cred-1' },
      ADMIN_ID,
      {
        scope: CREDENTIAL.scope,
        revokeResult: 'revoked',
        channelStop: 'failed_orphaned',
        channelExpiration: CHANNEL_EXPIRATION.toISOString(),
      },
    );
    // Dois argumentos exatos: o logger.warn nao recebe o objeto de erro.
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        userId: ADMIN_ID,
        channelStop: 'failed_orphaned',
        channelExpiration: CHANNEL_EXPIRATION.toISOString(),
      }),
    );
    for (const call of loggerWarn.mock.calls) {
      expect(call).toHaveLength(2);
    }
    // A coleta ve a linha real do logger: a afirmacao negativa abaixo nao e vazia.
    expect(logs()).toContain('failed_orphaned');
    esperarLogsLimpos(['Google 503', 'channel-sintetico', 'resource-sintetico']);
  });
});
