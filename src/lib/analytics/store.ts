/**
 * Server-side analytics event store (in-memory ring buffer).
 *
 * RESSALVA: Fallback store until an AnalyticsEvent Prisma model is introduced.
 * Non-persistent across process restarts; suitable for dev + preview.
 * In prod, configure NEXT_PUBLIC_ANALYTICS_PROVIDER (PostHog/Plausible) as the
 * source of truth; this store provides the admin funnel a best-effort view.
 */
import { UtmParams } from './events';

export type ServerAnalyticsEvent = {
  event: string;
  userId?: string | null;
  anonymousId: string;
  props: Record<string, unknown>;
  utm: UtmParams;
  timestamp: string; // ISO
  ip?: string;
  userAgent?: string;
};

const MAX_EVENTS = 10_000;

type GlobalWithStore = typeof globalThis & {
  __corglyAnalyticsStore?: ServerAnalyticsEvent[];
};

function getBuffer(): ServerAnalyticsEvent[] {
  const g = globalThis as GlobalWithStore;
  if (!g.__corglyAnalyticsStore) g.__corglyAnalyticsStore = [];
  return g.__corglyAnalyticsStore;
}

export function recordEvent(ev: ServerAnalyticsEvent) {
  const buf = getBuffer();
  buf.push(ev);
  if (buf.length > MAX_EVENTS) buf.splice(0, buf.length - MAX_EVENTS);
}

export function listEvents(opts: { from?: Date; to?: Date; event?: string } = {}): ServerAnalyticsEvent[] {
  const buf = getBuffer();
  return buf.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    if (opts.from && t < opts.from.getTime()) return false;
    if (opts.to && t > opts.to.getTime()) return false;
    if (opts.event && e.event !== opts.event) return false;
    return true;
  });
}

export function countUniqueByEvent(event: string, from?: Date, to?: Date): number {
  const seen = new Set<string>();
  for (const e of listEvents({ from, to, event })) {
    seen.add(e.userId || e.anonymousId);
  }
  return seen.size;
}
