/**
 * Testes para a rota de webhook do Google Calendar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// Mock do prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    googleCalendarCredential: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Mock do serviço de push
vi.mock('@/services/google-calendar-push.service', () => ({
  googleCalendarPushService: {
    incrementalSync: vi.fn(),
    handleChannelNotExists: vi.fn(),
  },
}));

const mockCredential = {
  id: 'cred-1',
  userId: 'user-1',
  channelTokenHash: 'a'.repeat(64), // SHA-256 hash
  resourceId: 'resource-1',
  lastMessageNumber: BigInt(100),
};

function createRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/v1/google/calendar/webhook', {
    method: 'POST',
    headers: new Headers(headers),
  });
}

describe('POST /api/v1/google/calendar/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 400 se headers obrigatorios faltam', async () => {
    const request = createRequest({});
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('retorna 404 se canal nao existe', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const request = createRequest({
      'X-Goog-Channel-ID': 'channel-1',
      'X-Goog-Channel-Token': 'token-1',
      'X-Goog-Resource-ID': 'resource-1',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Message-Number': '101',
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('retorna 401 se token e invalido', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    const request = createRequest({
      'X-Goog-Channel-ID': 'channel-1',
      'X-Goog-Channel-Token': 'wrong-token',
      'X-Goog-Resource-ID': 'resource-1',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Message-Number': '101',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('retorna 401 se resourceId diverge', async () => {
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);

    const request = createRequest({
      'X-Goog-Channel-ID': 'channel-1',
      'X-Goog-Channel-Token': 'token-1', // hash matches mock
      'X-Goog-Resource-ID': 'different-resource',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Message-Number': '101',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('retorna 204 para handshake sync', async () => {
    const crypto = await import('crypto');
    const validToken = 'token-1';
    const validHash = crypto.createHash('sha256').update(validToken).digest('hex');

    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCredential,
      channelTokenHash: validHash,
      resourceId: null, // Pendente de vinculacao
    });

    const request = createRequest({
      'X-Goog-Channel-ID': 'channel-1',
      'X-Goog-Channel-Token': validToken,
      'X-Goog-Resource-ID': 'resource-1',
      'X-Goog-Resource-State': 'sync',
      'X-Goog-Message-Number': '1',
    });

    const response = await POST(request);
    expect(response.status).toBe(204);
  });

  it('retorna 503 com Retry-After se sync ja em andamento', async () => {
    const { googleCalendarPushService } = await import('@/services/google-calendar-push.service');
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredential);
    (googleCalendarPushService.incrementalSync as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AppError('GOOGLE_SYNC_BUSY', 'Sincronizacao Google ja em andamento.', 503)
    );

    // Token que gera hash correto
    const crypto = await import('crypto');
    const validToken = 'token-1';
    const validHash = crypto.createHash('sha256').update(validToken).digest('hex');

    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCredential,
      channelTokenHash: validHash,
    });

    const request = createRequest({
      'X-Goog-Channel-ID': 'channel-1',
      'X-Goog-Channel-Token': validToken,
      'X-Goog-Resource-ID': 'resource-1',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Message-Number': '101',
    });

    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('rejeita exists antes do bind inicial de resourceId', async () => {
    const crypto = await import('crypto');
    const validToken = 'token-1';
    const validHash = crypto.createHash('sha256').update(validToken).digest('hex');
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCredential,
      channelTokenHash: validHash,
      resourceId: null,
    });

    const response = await POST(createRequest({
      'X-Goog-Channel-ID': 'channel-1',
      'X-Goog-Channel-Token': validToken,
      'X-Goog-Resource-ID': 'forged-resource',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Message-Number': '2',
    }));

    expect(response.status).toBe(401);
    const { googleCalendarPushService } = await import('@/services/google-calendar-push.service');
    expect(googleCalendarPushService.incrementalSync).not.toHaveBeenCalled();
  });

  it('[REGRESSAO F1] exists com token valido e canal vinculado sincroniza', async () => {
    const { googleCalendarPushService } = await import('@/services/google-calendar-push.service');
    const crypto = await import('crypto');
    const validHash = crypto.createHash('sha256').update('token-1').digest('hex');
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCredential,
      channelTokenHash: validHash,
    });
    (googleCalendarPushService.incrementalSync as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const response = await POST(createRequest({
      'X-Goog-Channel-ID': 'channel-1',
      'X-Goog-Channel-Token': 'token-1',
      'X-Goog-Resource-ID': 'resource-1',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Message-Number': '101',
    }));

    expect(response.status).toBe(204);
    expect(googleCalendarPushService.incrementalSync).toHaveBeenCalledWith(mockCredential.userId, {
      channelId: 'channel-1',
      messageNumber: BigInt(101),
    });
  });

  it('[RED L4] falha do sync registra so nome e codigo do erro', async () => {
    const { googleCalendarPushService } = await import('@/services/google-calendar-push.service');
    const crypto = await import('crypto');
    const validHash = crypto.createHash('sha256').update('token-1').digest('hex');
    (prisma.googleCalendarCredential.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCredential,
      channelTokenHash: validHash,
    });
    (googleCalendarPushService.incrementalSync as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('detalhe-interno-sintetico-gap11'),
    );
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const cru = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(createRequest({
      'X-Goog-Channel-ID': 'channel-1',
      'X-Goog-Channel-Token': 'token-1',
      'X-Goog-Resource-ID': 'resource-1',
      'X-Goog-Resource-State': 'exists',
      'X-Goog-Message-Number': '101',
    }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Sync failed' });
    expect(spy.mock.calls).toEqual([
      [
        'Erro na sincronizacao incremental',
        { action: 'google-calendar.webhook.sync', userId: 'user-1', errorName: 'Error', errorCode: undefined },
      ],
    ]);
    expect(
      spy.mock.calls.flat().some(
        (a) => a instanceof Error || String(JSON.stringify(a)).includes('detalhe-interno-sintetico-gap11'),
      ),
    ).toBe(false);
    expect(cru).not.toHaveBeenCalled();
    spy.mockRestore();
    cru.mockRestore();
  });
});
