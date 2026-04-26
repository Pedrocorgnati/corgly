import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordEvent } from '@/lib/analytics/store';
import { UTM_KEYS } from '@/lib/analytics/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UtmSchema = z.object(
  Object.fromEntries(UTM_KEYS.map((k) => [k, z.string().max(200).optional()])),
).partial();

const BodySchema = z.object({
  event: z.string().min(1).max(80),
  userId: z.string().nullish(),
  anonymousId: z.string().min(1).max(80),
  props: z.record(z.string(), z.unknown()).default({}),
  utm: UtmSchema.default({}),
  timestamp: z.string().datetime().optional(),
});

/**
 * POST /api/v1/analytics/track
 * Accepts events from client (fetch or navigator.sendBeacon).
 * Sensitive events (purchase) SHOULD be emitted server-side as well, from
 * the Stripe webhook handler, to avoid client-side tampering.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }
    const data = parsed.data;
    recordEvent({
      event: data.event,
      userId: data.userId ?? null,
      anonymousId: data.anonymousId,
      props: data.props,
      utm: data.utm,
      timestamp: data.timestamp || new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
}
