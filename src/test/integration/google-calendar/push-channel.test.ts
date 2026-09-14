/**
 * Ciclo push do Google Calendar com banco real e somente a API externa mockada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cleanDatabase, testPrisma } from '../setup';
import { createTestAdmin, createTestSlot } from '../helpers/db.helper';
import { encryptCredential } from '@/lib/google/credential-crypto';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';
import { POST as webhook } from '@/app/api/v1/google/calendar/webhook/route';
import type { GoogleCalendarEvent } from '@/lib/google/calendar-client';

const fetchMock = vi.fn();
let channelToken = '';
let resourceId = 'resource-integration';
let fullEvents: GoogleCalendarEvent[] = [];
let incrementalEvents: GoogleCalendarEvent[] = [];
let incrementalGone = false;
let syncSequence = 0;

vi.hoisted(() => {
  process.env.GOOGLE_CALENDAR_WEBHOOK_URL =
    'https://corgly.test/api/v1/google/calendar/webhook';
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id-integration';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret-integration';
});

function event(id: string, startAt: Date, endAt: Date): GoogleCalendarEvent {
  return {
    id,
    status: 'confirmed',
    start: { dateTime: startAt.toISOString() },
    end: { dateTime: endAt.toISOString() },
  };
}

async function connectedProfessor() {
  const professor = await createTestAdmin();
  await testPrisma.googleCalendarCredential.create({
    data: {
      userId: professor.id,
      refreshTokenEnc: encryptCredential('refresh-token-integration'),
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
    },
  });
  return professor;
}

async function waitUntil(predicate: () => Promise<boolean>, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`condicao nao satisfeita em ${timeoutMs}ms`);
}

beforeEach(() => {
  channelToken = '';
  resourceId = 'resource-integration';
  fullEvents = [];
  incrementalEvents = [];
  incrementalGone = false;
  syncSequence = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-integration', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/events/watch')) {
      const body = JSON.parse(String(init?.body));
      channelToken = body.token;
      return new Response(JSON.stringify({
        id: body.id,
        resourceId,
        expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/channels/stop')) return new Response(null, { status: 204 });
    if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events?')) {
      const params = new URL(url).searchParams;
      if (params.has('syncToken')) {
        if (incrementalGone) {
          incrementalGone = false;
          return new Response('gone', { status: 410 });
        }
        return new Response(JSON.stringify({
          items: incrementalEvents,
          nextSyncToken: `sync-${++syncSequence}`,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        items: fullEvents,
        nextSyncToken: `sync-${++syncSequence}`,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`fetch inesperado: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanDatabase();
});

describe('Push Channel Integration', () => {
  it('cria canal e propaga notificacao viva ao ledger em menos de 5 segundos', async () => {
    const professor = await connectedProfessor();
    const slot = await createTestSlot({
      startAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    const created = await googleCalendarPushService.createChannel(professor.id);
    const credential = await testPrisma.googleCalendarCredential.findUniqueOrThrow({
      where: { userId: professor.id },
    });
    expect(credential.channelId).toBe(created.channelId);
    expect(credential.resourceId).toBe(resourceId);
    expect(credential.syncToken).toBe('sync-1');
    expect(credential.channelTokenEnc).toBeNull();

    incrementalEvents = [event('event-push', slot.startAt, slot.endAt)];
    const startedAt = Date.now();
    const response = await webhook(new NextRequest(
      'http://localhost/api/v1/google/calendar/webhook',
      {
        method: 'POST',
        headers: {
          'X-Goog-Channel-ID': created.channelId,
          'X-Goog-Channel-Token': channelToken,
          'X-Goog-Resource-ID': resourceId,
          'X-Goog-Resource-State': 'exists',
          'X-Goog-Message-Number': '2',
        },
      },
    ));
    expect(response.status).toBe(204);

    await waitUntil(async () => Boolean(await testPrisma.externalBusyInterval.findUnique({
      where: { externalEventId: 'event-push' },
    })));
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    const updated = await testPrisma.googleCalendarCredential.findUniqueOrThrow({
      where: { userId: professor.id },
    });
    expect(updated.syncToken).toBe('sync-2');
    expect(updated.lastMessageNumber).toBe(BigInt(2));
  });

  it('410 limpa o token e conclui novo full sync reintentavel', async () => {
    const professor = await connectedProfessor();
    await googleCalendarPushService.createChannel(professor.id);
    incrementalGone = true;

    await googleCalendarPushService.incrementalSync(professor.id, {
      channelId: (await testPrisma.googleCalendarCredential.findUniqueOrThrow({
        where: { userId: professor.id },
      })).channelId!,
      messageNumber: BigInt(3),
    });

    const credential = await testPrisma.googleCalendarCredential.findUniqueOrThrow({
      where: { userId: professor.id },
    });
    expect(credential.syncToken).toBe('sync-2');
    expect(credential.lastMessageNumber).toBe(BigInt(3));
  });
});
