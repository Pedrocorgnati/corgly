'use client';

/**
 * Analytics client — provider-agnostic (PostHog/Plausible via env),
 * with offline-safe queue and server beacon fallback.
 *
 * Configure via env:
 *   NEXT_PUBLIC_ANALYTICS_PROVIDER = 'posthog' | 'plausible' | 'none'
 *   NEXT_PUBLIC_POSTHOG_KEY
 *   NEXT_PUBLIC_POSTHOG_HOST
 */
import { AnalyticsEventName, UTM_KEYS, UtmParams } from './events';

type Props = Record<string, unknown>;

const QUEUE_KEY = 'corgly_analytics_queue_v1';
const ANON_KEY = 'corgly_anon_id_v1';
const UTM_KEY = 'corgly_utm_v1';
const UTM_COOKIE_DAYS = 30;

// ---------- Anonymous ID ----------
function getAnonymousId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id =
      (crypto && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

// ---------- UTM ----------
function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function captureUtmFromUrl(): UtmParams {
  if (typeof window === 'undefined') return {};
  const existing = readCookie(UTM_KEY);
  if (existing) {
    try { return JSON.parse(existing) as UtmParams; } catch { /* noop */ }
  }
  const params = new URLSearchParams(window.location.search);
  const utm: UtmParams = {};
  UTM_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) (utm as Record<string, string>)[k] = v;
  });
  if (Object.keys(utm).length > 0) {
    setCookie(UTM_KEY, JSON.stringify(utm), UTM_COOKIE_DAYS);
  }
  return utm;
}

export function getStoredUtm(): UtmParams {
  const raw = readCookie(UTM_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) as UtmParams; } catch { return {}; }
}

// ---------- Queue (offline-safe) ----------
type QueuedEvent = {
  event: AnalyticsEventName | string;
  props: Props;
  utm: UtmParams;
  anonymousId: string;
  userId?: string | null;
  timestamp: string;
};

function readQueue(): QueuedEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch { return []; }
}

function writeQueue(q: QueuedEvent[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200))); } catch { /* quota */ }
}

async function sendBeacon(ev: QueuedEvent): Promise<boolean> {
  try {
    const body = JSON.stringify(ev);
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/v1/analytics/track', blob);
      if (ok) return true;
    }
    const res = await fetch('/api/v1/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function flushQueue() {
  if (typeof window === 'undefined') return;
  const q = readQueue();
  if (q.length === 0) return;
  const remaining: QueuedEvent[] = [];
  for (const ev of q) {
    const ok = await sendBeacon(ev);
    if (!ok) remaining.push(ev);
  }
  writeQueue(remaining);
}

// ---------- Provider dispatch ----------
function dispatchProvider(event: string, props: Props) {
  if (typeof window === 'undefined') return;
  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER;
  if (provider === 'posthog') {
    const ph = (window as unknown as { posthog?: { capture: (e: string, p: Props) => void } }).posthog;
    ph?.capture?.(event, props);
  } else if (provider === 'plausible') {
    const pl = (window as unknown as { plausible?: (e: string, opts?: { props: Props }) => void }).plausible;
    pl?.(event, { props });
  }
  // 'none' / unset => rely on server beacon only (DB fallback)
}

// ---------- Public API ----------
export function track(event: AnalyticsEventName | string, props: Props = {}) {
  if (typeof window === 'undefined') return;
  const utm = getStoredUtm();
  const queued: QueuedEvent = {
    event,
    props,
    utm,
    anonymousId: getAnonymousId(),
    userId: null,
    timestamp: new Date().toISOString(),
  };

  // fire and forget to provider
  dispatchProvider(event, { ...props, ...utm });

  // fire beacon, queue on failure
  sendBeacon(queued).then((ok) => {
    if (!ok) {
      const q = readQueue();
      q.push(queued);
      writeQueue(q);
    }
  });
}

export function initAnalytics() {
  if (typeof window === 'undefined') return;
  captureUtmFromUrl();
  // flush on load + on reconnect
  flushQueue();
  window.addEventListener('online', flushQueue);
}
