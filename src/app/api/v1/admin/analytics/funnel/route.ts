import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { FunnelSteps } from '@/lib/analytics/events';
import { countUniqueByEvent } from '@/lib/analytics/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/analytics/funnel?period=7d|30d|90d
 * Returns funnel step counts + drop-off ratios.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') || '30d') as '7d' | '30d' | '90d';
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);

  const steps = FunnelSteps.map((s) => ({
    key: s.key,
    label: s.label,
    event: s.event,
    count: countUniqueByEvent(s.event, from, to),
  }));

  const withDropoff = steps.map((s, idx) => {
    const prev = idx === 0 ? null : steps[idx - 1];
    const conversion = prev && prev.count > 0 ? s.count / prev.count : null;
    const dropoff = conversion == null ? null : 1 - conversion;
    return { ...s, conversion, dropoff };
  });

  return NextResponse.json({
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    steps: withDropoff,
  });
}
