/**
 * Testes unitarios para calendar-client.ts.
 *
 * Mocka `prisma.googleCalendarCredential.findUnique` e a funcao `fetch` global
 * para testar os caminhos de erro e sucesso sem depender de API externa.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppError } from '@/lib/errors';

// Mock do prisma antes de qualquer import
vi.mock('@/lib/prisma', () => ({
  prisma: {
    googleCalendarCredential: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock do credential-crypto
vi.mock('../credential-crypto', () => ({
  decryptCredential: vi.fn((token: string) => token.replace('encrypted:', '')),
}));

// Mock do env
vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: 'test-encryption-key-32-bytes!!!!',
  },
}));

// Importa depois dos mocks
import { prisma } from '@/lib/prisma';
import { getCalendarClient, listBusyEvents } from '../calendar-client';

// Interceptar fetch sem usar MSW
const originalFetch = global.fetch;
const mockFetch = vi.fn();

const mockCredential = {
  userId: 'user-123',
  refreshTokenEnc: 'encrypted:mock-refresh-token',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('getCalendarClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lanca GOOGLE_CREDENTIAL_NOT_FOUND quando credencial nao existe', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(getCalendarClient('user-123')).rejects.toThrow(AppError);
    try {
      await getCalendarClient('user-123');
    } catch (err) {
      expect((err as AppError).code).toBe('GOOGLE_CREDENTIAL_NOT_FOUND');
      expect((err as AppError).status).toBe(404);
    }
  });

  it('lanca GOOGLE_REFRESH_TOKEN_INVALID quando refresh token e invalido', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"error": "invalid_grant"}',
    });

    try {
      await getCalendarClient('user-123');
      // Se chegou aqui, o erro nao foi lancado
      expect.fail('Esperava que GOOGLE_REFRESH_TOKEN_INVALID fosse lancado');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('GOOGLE_REFRESH_TOKEN_INVALID');
      expect((err as AppError).status).toBe(401);
    }
  });

  it('obtem access token e retorna cliente funcional', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    // Mock do refresh token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
    });

    const client = await getCalendarClient('user-123');
    expect(client).toBeDefined();
    expect(typeof client.listEvents).toBe('function');
  });

  it('listEvents retorna eventos apos paginacao completa', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    // Mock do refresh token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
    });

    // Primeira pagina de eventos
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { id: 'event-1', status: 'confirmed', start: { dateTime: '2026-09-10T10:00:00Z' }, end: { dateTime: '2026-09-10T11:00:00Z' } },
        ],
        nextPageToken: 'page-2',
      }),
    });

    // Segunda pagina de eventos
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { id: 'event-2', status: 'confirmed', start: { dateTime: '2026-09-10T14:00:00Z' }, end: { dateTime: '2026-09-10T15:00:00Z' } },
        ],
        // Sem nextPageToken = fim da paginacao
      }),
    });

    const client = await getCalendarClient('user-123');
    const events = await client.listEvents(new Date('2026-09-10'), new Date('2026-09-11'));

    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('event-1');
    expect(events[1].id).toBe('event-2');
  });

  it('envia singleEvents=true e showDeleted=true para expandir recorrencias e ver cancelados', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const client = await getCalendarClient('user-123');
    await client.listEvents(new Date(), new Date());

    const callUrl = mockFetch.mock.calls[1][0];
    expect(callUrl).toContain('singleEvents=true');
    expect(callUrl).toContain('showDeleted=true');
  });

  it('fullSync pagina e usa somente o nextSyncToken final', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'event-1', status: 'confirmed', start: {}, end: {} }],
        nextPageToken: 'page-2',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'event-2', status: 'confirmed', start: {}, end: {} }],
        nextSyncToken: 'sync-final',
      }), { status: 200 }));

    const client = await getCalendarClient('user-123');
    const result = await client.fullSync(new Date('2026-09-10'), new Date('2026-09-11'));

    expect(result.events.map((event) => event.id)).toEqual(['event-1', 'event-2']);
    expect(result.nextSyncToken).toBe('sync-final');
    expect(String(mockFetch.mock.calls[2][0])).toContain('pageToken=page-2');
  });

  it('410 incremental nao entra em retry generico', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('gone', { status: 410, headers: { 'Retry-After': '0' } }));

    const client = await getCalendarClient('user-123');
    await expect(client.syncIncremental('expired-token')).rejects.toMatchObject({
      code: 'GOOGLE_SYNC_TOKEN_EXPIRED',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('4xx permanente com Retry-After nao e repetido', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('bad request', { status: 400, headers: { 'Retry-After': '0' } }));

    const client = await getCalendarClient('user-123');
    await expect(client.syncIncremental('token')).rejects.toMatchObject({ code: 'GOOGLE_API_ERROR' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('429 respeita Retry-After e repete no maximo permitido', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('rate limit', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextSyncToken: 'sync-next' }), { status: 200 }));

    const client = await getCalendarClient('user-123');
    await expect(client.syncIncremental('token')).resolves.toEqual({ events: [], nextSyncToken: 'sync-next' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('watch envia token e stop trata 404 e 410 como idempotentes', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'channel-1',
        resourceId: 'resource-1',
        expiration: String(new Date('2026-09-16T00:00:00Z').getTime()),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 410 }));

    const client = await getCalendarClient('user-123');
    await expect(client.watchEvents('https://example.test/webhook', 'channel-1', 'secret-token')).resolves.toMatchObject({
      channelId: 'channel-1',
      resourceId: 'resource-1',
    });
    const watchBody = JSON.parse(String(mockFetch.mock.calls[1][1]?.body));
    expect(watchBody).toMatchObject({ id: 'channel-1', token: 'secret-token' });
    await expect(client.stopWatch('channel-1', 'resource-1')).resolves.toBeUndefined();
    await expect(client.stopWatch('channel-1', 'resource-1')).resolves.toBeUndefined();
  });
});

describe('listBusyEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('ignora eventos de dia inteiro', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          // Evento de dia inteiro (sem dateTime) - deve ser ignorado
          { id: 'all-day-1', status: 'confirmed', start: { date: '2026-09-10' }, end: { date: '2026-09-11' } },
          // Evento com horario - deve ser retornado
          { id: 'timed-1', status: 'confirmed', start: { dateTime: '2026-09-10T10:00:00Z' }, end: { dateTime: '2026-09-10T11:00:00Z' } },
        ],
      }),
    });

    const events = await listBusyEvents('user-123', new Date(), new Date());

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('timed-1');
  });

  it('marca eventos com transparency=transparent como isTransparent=true', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { id: 'opaque-1', status: 'confirmed', transparency: 'opaque', start: { dateTime: '2026-09-10T10:00:00Z' }, end: { dateTime: '2026-09-10T11:00:00Z' } },
          { id: 'transparent-1', status: 'confirmed', transparency: 'transparent', start: { dateTime: '2026-09-10T14:00:00Z' }, end: { dateTime: '2026-09-10T15:00:00Z' } },
          // Sem transparency = assume opaque (ocupado)
          { id: 'default-1', status: 'confirmed', start: { dateTime: '2026-09-10T16:00:00Z' }, end: { dateTime: '2026-09-10T17:00:00Z' } },
        ],
      }),
    });

    const events = await listBusyEvents('user-123', new Date(), new Date());

    expect(events).toHaveLength(3);
    expect(events.find(e => e.id === 'opaque-1')?.isTransparent).toBe(false);
    expect(events.find(e => e.id === 'transparent-1')?.isTransparent).toBe(true);
    expect(events.find(e => e.id === 'default-1')?.isTransparent).toBe(false);
  });

  it('inclui eventos com status=cancelled para permitir deteccao de remocoes', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { id: 'cancelled-1', status: 'cancelled', start: { dateTime: '2026-09-10T10:00:00Z' }, end: { dateTime: '2026-09-10T11:00:00Z' } },
        ],
      }),
    });

    const events = await listBusyEvents('user-123', new Date(), new Date());

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('cancelled');
  });
});
