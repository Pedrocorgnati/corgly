// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'x'.repeat(32),
  });
});

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

import { revokeGoogleToken } from '../oauth-revoke';

// Sentinela sintetico do PR7 do GAP-12: nunca um token real.
const REFRESH_TOKEN = 'refresh-token-sintetico-gap12-0000';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DESCRICAO_SINTETICA = `descricao sintetica com ${REFRESH_TOKEN}`;
const CORPO_TEXTUAL = 'corpo textual sintetico que o helper nao le';

type RespostaFalsa = {
  ok: boolean;
  status: number;
  json: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  headers?: Headers;
};

/** Resposta fabricada com `ok`, `status`, `json`, `text` e, se o caso pedir, `headers`. */
function resposta(
  status: number,
  corpo: () => Promise<unknown> = async () => ({}),
  headers?: Headers,
): RespostaFalsa {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(corpo),
    text: vi.fn(async () => CORPO_TEXTUAL),
    ...(headers ? { headers } : {}),
  };
}

function jsonInvalido(mensagem: string): () => Promise<unknown> {
  return async () => {
    throw new SyntaxError(mensagem);
  };
}

const restauradores: Array<() => void> = [];

/** Coleta ampliada de log: os cinco metodos de console, serializados. */
function coletarLogs() {
  const espioes = [
    vi.spyOn(console, 'error').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
    vi.spyOn(console, 'info').mockImplementation(() => {}),
    vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'debug').mockImplementation(() => {}),
  ];
  restauradores.push(() => espioes.forEach((espiao) => espiao.mockRestore()));
  return {
    total: () => espioes.reduce((soma, espiao) => soma + espiao.mock.calls.length, 0),
    serial: () => JSON.stringify(espioes.map((espiao) => espiao.mock.calls)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  restauradores.splice(0).forEach((restaurar) => restaurar());
  vi.unstubAllGlobals();
});

describe('revokeGoogleToken', () => {
  it('H1: um unico POST na URL fixa, Content-Type form-urlencoded e o token so no corpo', async () => {
    mocks.fetch.mockResolvedValue(resposta(200));

    await revokeGoogleToken(REFRESH_TOKEN);

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(REVOKE_URL);
    expect(url).not.toContain('token=');
    expect(url).not.toContain(REFRESH_TOKEN);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(init.body).toBe(new URLSearchParams({ token: REFRESH_TOKEN }).toString());
  });

  it('H2: 200 devolve { kind: revoked } sem ler o corpo', async () => {
    const res = resposta(200);
    mocks.fetch.mockResolvedValue(res);

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({ kind: 'revoked' });
    expect(res.json).not.toHaveBeenCalled();
    expect(res.text).not.toHaveBeenCalled();
  });

  it('H3: rejeicao do fetch vira network_error com o nome do erro, sem lancar e sem a message', async () => {
    mocks.fetch.mockRejectedValue(new TypeError('fetch failed'));

    const resultado = await revokeGoogleToken(REFRESH_TOKEN);

    expect(resultado).toEqual({ kind: 'network_error', errorName: 'TypeError' });
    expect(JSON.stringify(resultado)).not.toContain('fetch failed');
  });

  it('H3: rejeicao com valor que nao e Error vira network_error com errorName UnknownError', async () => {
    mocks.fetch.mockRejectedValue('falha sintetica sem Error');

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({
      kind: 'network_error',
      errorName: 'UnknownError',
    });
  });

  it.each([
    { valor: '30', segundos: 30 },
    { valor: '0', segundos: 0 },
  ])('H4: 429 com retry-after $valor devolve rate_limited com $segundos segundos', async ({ valor, segundos }) => {
    mocks.fetch.mockResolvedValue(resposta(429, async () => ({}), new Headers({ 'retry-after': valor })));

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: segundos,
    });
  });

  it.each([
    { caso: 'sem header retry-after', headers: new Headers() as Headers | undefined },
    { caso: 'sem objeto headers', headers: undefined },
    { caso: 'com retry-after em HTTP-date', headers: new Headers({ 'retry-after': 'Wed, 21 Oct 2015 07:28:00 GMT' }) },
    { caso: 'com retry-after negativo', headers: new Headers({ 'retry-after': '-5' }) },
    { caso: 'com retry-after fracionario', headers: new Headers({ 'retry-after': '1.5' }) },
  ])('H4: 429 $caso devolve rate_limited com retryAfterSeconds null', async ({ headers }) => {
    mocks.fetch.mockResolvedValue(resposta(429, async () => ({}), headers));

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: null,
    });
  });

  it.each([500, 503])('H5: %i com corpo nao JSON devolve upstream_error sem tentar parse', async (status) => {
    const res = resposta(status, jsonInvalido('Unexpected token < in JSON at position 0'));
    mocks.fetch.mockResolvedValue(res);

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({ kind: 'upstream_error', status });
    expect(res.json).not.toHaveBeenCalled();
    expect(res.text).not.toHaveBeenCalled();
  });

  it('H6: 400 com json que rejeita com SyntaxError devolve invalid_response', async () => {
    mocks.fetch.mockResolvedValue(resposta(400, jsonInvalido('Unexpected end of JSON input')));

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({ kind: 'invalid_response', status: 400 });
  });

  it.each([
    { caso: 'null', corpo: null as unknown },
    { caso: 'string', corpo: 'invalid_token' as unknown },
  ])('H6: 400 com corpo $caso, que nao e objeto, devolve invalid_response', async ({ corpo }) => {
    mocks.fetch.mockResolvedValue(resposta(400, async () => corpo));

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({ kind: 'invalid_response', status: 400 });
  });

  it.each(['invalid_token', 'invalid_grant'])(
    'H7: 400 { error: %s } devolve already_invalid com o code recebido',
    async (errorCode) => {
      mocks.fetch.mockResolvedValue(resposta(400, async () => ({ error: errorCode })));

      await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({ kind: 'already_invalid', errorCode });
    },
  );

  it('H8: 400 { error: unsupported_token_type } devolve rejected com o code', async () => {
    mocks.fetch.mockResolvedValue(resposta(400, async () => ({ error: 'unsupported_token_type' })));

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({
      kind: 'rejected',
      status: 400,
      errorCode: 'unsupported_token_type',
    });
  });

  it.each([
    { caso: '401 {}', status: 401, corpo: {} as unknown },
    { caso: '400 com error nao string', status: 400, corpo: { error: 42 } as unknown },
  ])('H8: $caso devolve rejected com errorCode null', async ({ status, corpo }) => {
    mocks.fetch.mockResolvedValue(resposta(status, async () => corpo));

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({ kind: 'rejected', status, errorCode: null });
  });

  it('H8: error de 200 caracteres sai truncado em 64 caracteres', async () => {
    mocks.fetch.mockResolvedValue(resposta(400, async () => ({ error: 'e'.repeat(200) })));

    await expect(revokeGoogleToken(REFRESH_TOKEN)).resolves.toEqual({
      kind: 'rejected',
      status: 400,
      errorCode: 'e'.repeat(64),
    });
  });

  it.each([
    { caso: '200', prepara: () => mocks.fetch.mockResolvedValue(resposta(200)) },
    {
      caso: 'rede com o token na message',
      prepara: () => mocks.fetch.mockRejectedValue(new TypeError(`fetch failed ${REFRESH_TOKEN}`)),
    },
    {
      caso: '429 com retry-after',
      prepara: () => mocks.fetch.mockResolvedValue(resposta(429, async () => ({}), new Headers({ 'retry-after': '30' }))),
    },
    { caso: '429 sem header', prepara: () => mocks.fetch.mockResolvedValue(resposta(429)) },
    {
      caso: '500 nao JSON',
      prepara: () => mocks.fetch.mockResolvedValue(resposta(500, jsonInvalido(`Unexpected token ${REFRESH_TOKEN}`))),
    },
    { caso: '503', prepara: () => mocks.fetch.mockResolvedValue(resposta(503)) },
    {
      caso: '400 com json invalido',
      prepara: () => mocks.fetch.mockResolvedValue(resposta(400, jsonInvalido(`Unexpected token ${REFRESH_TOKEN}`))),
    },
    {
      caso: '400 invalid_token com error_description',
      prepara: () =>
        mocks.fetch.mockResolvedValue(
          resposta(400, async () => ({ error: 'invalid_token', error_description: DESCRICAO_SINTETICA })),
        ),
    },
    {
      caso: '400 invalid_grant com error_description',
      prepara: () =>
        mocks.fetch.mockResolvedValue(
          resposta(400, async () => ({ error: 'invalid_grant', error_description: DESCRICAO_SINTETICA })),
        ),
    },
    {
      caso: '400 unsupported_token_type com error_description',
      prepara: () =>
        mocks.fetch.mockResolvedValue(
          resposta(400, async () => ({ error: 'unsupported_token_type', error_description: DESCRICAO_SINTETICA })),
        ),
    },
    { caso: '401 {}', prepara: () => mocks.fetch.mockResolvedValue(resposta(401)) },
    {
      caso: '400 com error de 200 caracteres',
      prepara: () => mocks.fetch.mockResolvedValue(resposta(400, async () => ({ error: 'e'.repeat(200) }))),
    },
  ])('H9: $caso nao devolve o token, error_description, corpo textual nem message, e nao loga', async ({ prepara }) => {
    prepara();
    const logs = coletarLogs();

    const resultado = await revokeGoogleToken(REFRESH_TOKEN);

    const serial = JSON.stringify(resultado);
    expect(serial).not.toContain(REFRESH_TOKEN);
    expect(serial).not.toContain('descricao sintetica');
    expect(serial).not.toContain(CORPO_TEXTUAL);
    expect(serial).not.toContain('fetch failed');
    expect(serial).not.toContain('Unexpected token');
    expect(logs.total()).toBe(0);
    expect(logs.serial()).not.toContain(REFRESH_TOKEN);
  });
});
