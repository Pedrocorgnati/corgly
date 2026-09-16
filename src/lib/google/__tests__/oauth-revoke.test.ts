// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'x'.repeat(32),
  });
});

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

import { revokeGoogleRefreshToken } from '../oauth-revoke';

const REFRESH_TOKEN = 'refresh-token-falso-de-teste';

describe('revokeGoogleRefreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envia o token no CORPO do POST, nunca na query da URL', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await revokeGoogleRefreshToken(REFRESH_TOKEN);

    expect(result).toEqual({ ok: true, alreadyRevoked: false });
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(url).not.toContain('?token=');
    expect(url).not.toContain(REFRESH_TOKEN);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(String(init.body)).toBe(`token=${encodeURIComponent(REFRESH_TOKEN)}`);
  });

  it('invalid_token: sucesso idempotente (ja revogado no Google)', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_token' }),
    });

    const result = await revokeGoogleRefreshToken(REFRESH_TOKEN);

    expect(result).toEqual({ ok: true, alreadyRevoked: true });
  });

  it('5xx do Google: ok=false com reason google_error', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'server_error' }),
    });

    const result = await revokeGoogleRefreshToken(REFRESH_TOKEN);

    expect(result).toEqual({ ok: false, reason: 'google_error' });
  });

  it('falha de rede: ok=false com reason network', async () => {
    mocks.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await revokeGoogleRefreshToken(REFRESH_TOKEN);

    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('nenhum caminho loga o refresh token em claro', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await revokeGoogleRefreshToken(REFRESH_TOKEN);

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
