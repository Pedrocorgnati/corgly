import 'server-only';

export type MetricPeriod = '7d' | '30d' | '90d' | 'custom';

export interface ResolvedPeriod {
  period: MetricPeriod;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}

const PRESET_DAYS: Record<Exclude<MetricPeriod, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export function resolvePeriod(params: URLSearchParams): ResolvedPeriod {
  const raw = (params.get('period') ?? '30d') as MetricPeriod;
  const now = new Date();
  const to = now;

  if (raw === 'custom') {
    const fromParam = params.get('from');
    const toParam = params.get('to');
    const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 86400000);
    const toCustom = toParam ? new Date(toParam) : now;
    const span = toCustom.getTime() - from.getTime();
    return {
      period: 'custom',
      from,
      to: toCustom,
      previousFrom: new Date(from.getTime() - span),
      previousTo: from,
    };
  }

  const days = PRESET_DAYS[raw] ?? 30;
  const from = new Date(now.getTime() - days * 86400000);
  return {
    period: raw in PRESET_DAYS ? raw : '30d',
    from,
    to,
    previousFrom: new Date(from.getTime() - days * 86400000),
    previousTo: from,
  };
}

const cache = new Map<string, { value: unknown; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function withMetricsCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
