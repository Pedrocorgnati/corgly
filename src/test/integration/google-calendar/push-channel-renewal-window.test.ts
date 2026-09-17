/**
 * Janela da renovacao do canal push: o canal antigo segue reconhecido pelo
 * webhook enquanto o Google ainda nao confirmou o canal novo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { cleanDatabase, testPrisma } from '../setup';
import { createTestAdmin } from '../helpers/db.helper';
import { encryptCredential } from '@/lib/google/credential-crypto';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';
import { POST as webhook } from '@/app/api/v1/google/calendar/webhook/route';

const fetchMock = vi.fn();
let statusDuranteWatch: number | null = null;

vi.hoisted(() => {
  process.env.GOOGLE_CALENDAR_WEBHOOK_URL =
    'https://corgly.test/api/v1/google/calendar/webhook';
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id-integration';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret-integration';
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  statusDuranteWatch = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return json({ access_token: 'access-integration', expires_in: 3600 });
    }
    if (url.endsWith('/events/watch')) {
      const body = JSON.parse(String(init?.body));
      const response = await webhook(new NextRequest(
        'http://localhost/api/v1/google/calendar/webhook',
        {
          method: 'POST',
          headers: {
            'X-Goog-Channel-ID': 'channel-old',
            'X-Goog-Channel-Token': 'token-old',
            'X-Goog-Resource-ID': 'resource-old',
            'X-Goog-Resource-State': 'exists',
            'X-Goog-Message-Number': '5',
          },
        },
      ));
      statusDuranteWatch = response.status;
      return json({
        id: body.id,
        resourceId: 'resource-new',
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }
    if (url.endsWith('/channels/stop')) return new Response(null, { status: 204 });
    if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events?')) {
      return json({ items: [], nextSyncToken: 'sync-new' });
    }
    throw new Error(`fetch inesperado: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanDatabase();
});

describe('Push Channel Renewal Window Integration', () => {
  it('[RED W4] webhook do canal antigo responde 204 durante o watch da renovacao', async () => {
    const professor = await createTestAdmin();
    await testPrisma.googleCalendarCredential.create({
      data: {
        userId: professor.id,
        refreshTokenEnc: encryptCredential('refresh-token-integration'),
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        channelId: 'channel-old',
        channelTokenHash: crypto.createHash('sha256').update('token-old').digest('hex'),
        resourceId: 'resource-old',
        channelExpiration: new Date(Date.now() + 60 * 60 * 1000),
        syncToken: 'sync-old',
      },
    });

    expect(await googleCalendarPushService.renewChannel(professor.id)).toBe(true);
    expect(statusDuranteWatch).toBe(204);
  });
});
