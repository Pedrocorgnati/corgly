// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockListWebhookEvents = vi.hoisted(() => vi.fn());
const mockReplayWebhookEvent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/services/stripe.service', () => ({
  stripeService: {
    listWebhookEvents: mockListWebhookEvents,
    replayWebhookEvent: mockReplayWebhookEvent,
  },
}));

import { GET, POST } from './route';

function getRequest(url = 'http://localhost/api/v1/admin/webhooks/stripe') {
  return new NextRequest(url, { method: 'GET' });
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/admin/webhooks/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/v1/admin/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', tokenVersion: 0 });
  });

  it('lista eventos com status filtrado para o admin', async () => {
    mockListWebhookEvents.mockResolvedValue({
      items: [
        {
          eventId: 'evt_1',
          type: 'invoice.payment_failed',
          status: 'FAILED',
          errorMessage: 'boom',
        },
      ],
      total: 1,
    });

    const res = await GET(getRequest('http://localhost/api/v1/admin/webhooks/stripe?status=FAILED'));

    expect(res.status).toBe(200);
    expect(mockListWebhookEvents).toHaveBeenCalledWith('FAILED');
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].eventId).toBe('evt_1');
  });

  it('reprocessa evento por eventId e retorna feedback de replay', async () => {
    mockReplayWebhookEvent.mockResolvedValue({
      event: { eventId: 'evt_failed', status: 'PROCESSED' },
      idempotentReplay: false,
    });

    const res = await POST(postRequest({ eventId: 'evt_failed' }));

    expect(res.status).toBe(201);
    expect(mockReplayWebhookEvent).toHaveBeenCalledWith('evt_failed');
    const body = await res.json();
    expect(body.message).toBe('Replay executado.');
    expect(body.data.event.status).toBe('PROCESSED');
  });

  it('rejeita status invalido', async () => {
    const res = await GET(getRequest('http://localhost/api/v1/admin/webhooks/stripe?status=BROKEN'));

    expect(res.status).toBe(400);
    expect(mockListWebhookEvents).not.toHaveBeenCalled();
  });
});
