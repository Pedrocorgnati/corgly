// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createEbookEmailSender,
  EbookEmailSendError,
  type EbookEmailMessage,
} from '../ebook-email.service';

const API_KEY = 're_test_chave_ficticia_0000';
const TO = 'comprador@example.com';

const message: EbookEmailMessage = {
  to: TO,
  subject: 'Seu ebook chegou',
  html: '<p>link https://app.example.com/ebooks/acesso/tok</p>',
  text: 'link https://app.example.com/ebooks/acesso/tok',
  idempotencyKey: 'ebook-delivery/ord_1/1',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// apiKey explicito por argumento: parametro default trocaria `undefined` pela chave
function senderWith(fetchImpl: typeof fetch, ...apiKeyArg: [string | undefined] | []) {
  const apiKey = apiKeyArg.length === 0 ? API_KEY : apiKeyArg[0];
  return createEbookEmailSender({ apiKey, from: 'Corgly <ebooks@example.com>', fetchImpl });
}

async function captureError(promise: Promise<unknown>): Promise<EbookEmailSendError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(EbookEmailSendError);
    return err as EbookEmailSendError;
  }
  throw new Error('esperava EbookEmailSendError');
}

function expectNoLeak(err: EbookEmailSendError): void {
  expect(err.message).not.toContain(TO);
  expect(err.message).not.toContain(API_KEY);
  expect(err.message).not.toContain('https://');
}

describe('createEbookEmailSender.send', () => {
  it('envia POST com Idempotency-Key, Bearer e corpo com text', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: 'em_123' }));
    const result = await senderWith(fetchImpl as unknown as typeof fetch).send(message);

    expect(result).toEqual({ id: 'em_123' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe(message.idempotencyKey);
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      from: 'Corgly <ebooks@example.com>',
      to: TO,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it.each([undefined, '', '   '])('sem chave (%j) lanca transiente sem chamar fetch', async (apiKey) => {
    const fetchImpl = vi.fn();
    const err = await captureError(
      senderWith(fetchImpl as unknown as typeof fetch, apiKey).send(message),
    );
    expect(err.transient).toBe(true);
    expect(err.status).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 422])('status %i e permanente', async (status) => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(status, { name: 'validation_error', message: `destinatario ${TO} invalido` }),
    );
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(false);
    expect(err.status).toBe(status);
    expectNoLeak(err);
  });

  it.each([408, 429, 500, 502, 503])('status %i e transiente', async (status) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status, { name: 'rate_limit_exceeded' }));
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(true);
    expect(err.status).toBe(status);
    expectNoLeak(err);
  });

  it('409 concurrent_idempotent_requests e transiente', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { name: 'concurrent_idempotent_requests' }),
    );
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(true);
    expect(err.message).toContain('concurrent_idempotent_requests');
  });

  it('409 invalid_idempotent_request e permanente', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(409, { name: 'invalid_idempotent_request' }));
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(false);
    expect(err.status).toBe(409);
  });

  it('409 sem corpo e permanente (nao ha prova de concorrencia)', async () => {
    const fetchImpl = vi.fn(async () => new Response('nao-json', { status: 409 }));
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(false);
  });

  it('timeout/abort e transiente sem status', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(true);
    expect(err.status).toBeNull();
    expectNoLeak(err);
  });

  it('erro de rede e transiente', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(`fetch failed para ${TO}`);
    });
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(true);
    expectNoLeak(err);
  });

  it.each([{}, { id: '' }, { id: 42 }])('2xx sem id valido (%j) e transiente', async (body) => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, body));
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(true);
    expect(err.status).toBe(200);
  });

  it('2xx com corpo nao-JSON e transiente', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const err = await captureError(senderWith(fetchImpl as unknown as typeof fetch).send(message));
    expect(err.transient).toBe(true);
  });

  it('resolve o fetch global na hora da chamada quando fetchImpl ausente', async () => {
    const sender = createEbookEmailSender({ apiKey: API_KEY, from: 'x@example.com' });
    const spy = vi.fn(async () => jsonResponse(200, { id: 'em_global' }));
    vi.stubGlobal('fetch', spy);
    try {
      await expect(sender.send(message)).resolves.toEqual({ id: 'em_global' });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('createEbookEmailSender.getState', () => {
  it.each([
    ['delivered', 'delivered'],
    ['opened', 'opened'],
    ['clicked', 'clicked'],
    ['failed', 'failed'],
    ['bounced', 'bounced'],
    ['suppressed', 'suppressed'],
    ['complained', 'complained'],
    ['sent', 'pending'],
    ['queued', 'pending'],
    ['delivery_delayed', 'pending'],
    [null, 'pending'],
  ])('last_event %j vira %s', async (lastEvent, expected) => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: 'em_1', last_event: lastEvent }));
    const sender = senderWith(fetchImpl as unknown as typeof fetch);
    await expect(sender.getState('em_1')).resolves.toBe(expected);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails/em_1');
    expect(init.method).toBe('GET');
  });

  it('corpo sem last_event vira pending', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: 'em_1' }));
    await expect(senderWith(fetchImpl as unknown as typeof fetch).getState('em_1')).resolves.toBe(
      'pending',
    );
  });

  it('erro HTTP do getState segue a mesma classificacao', async () => {
    const notFound = vi.fn(async () => jsonResponse(404, { name: 'not_found' }));
    const e404 = await captureError(senderWith(notFound as unknown as typeof fetch).getState('em_1'));
    expect(e404.transient).toBe(false);

    const unavailable = vi.fn(async () => jsonResponse(503, {}));
    const e503 = await captureError(
      senderWith(unavailable as unknown as typeof fetch).getState('em_1'),
    );
    expect(e503.transient).toBe(true);
  });

  it('sem chave o getState lanca transiente sem fetch', async () => {
    const fetchImpl = vi.fn();
    const err = await captureError(
      senderWith(fetchImpl as unknown as typeof fetch, undefined).getState('em_1'),
    );
    expect(err.transient).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
