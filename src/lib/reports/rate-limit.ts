import 'server-only';

const buckets = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 10;

export function checkReportRateLimit(adminId: string): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const arr = (buckets.get(adminId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= LIMIT) {
    const resetAt = arr[0] + WINDOW_MS;
    buckets.set(adminId, arr);
    return { ok: false, remaining: 0, resetAt };
  }
  arr.push(now);
  buckets.set(adminId, arr);
  return { ok: true, remaining: LIMIT - arr.length, resetAt: now + WINDOW_MS };
}
