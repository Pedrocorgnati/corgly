import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { collectSystemMetrics, deriveAlerts } from '@/lib/observability/system-health.service';

/**
 * GET /api/v1/admin/dashboard/alerts
 * Retorna os alertas criticos derivados do estado dos subsistemas, prontos para
 * exibir no dashboard admin. Restrito a ADMIN. Nunca cacheado.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const metrics = await collectSystemMetrics();
    const alerts = deriveAlerts(metrics);

    const summary = {
      overall: metrics.overall,
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
    };

    return NextResponse.json(apiResponse({ summary, alerts }), {
      headers: { 'Cache-Control': 'no-store, no-cache' },
    });
  } catch (err) {
    console.error('GET /admin/dashboard/alerts', err);
    return NextResponse.json(apiResponse(null, 'Erro ao coletar alertas do dashboard.'), {
      status: 500,
    });
  }
}
