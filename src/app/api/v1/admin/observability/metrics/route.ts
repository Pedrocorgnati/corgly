import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { collectSystemMetrics } from '@/lib/observability/system-health.service';

/**
 * GET /api/v1/admin/observability/metrics
 * Retorna o status agregado de todos os subsistemas (DB, Stripe, email,
 * Hocuspocus, TURN, fila de jobs) + metricas de session health agregadas sem
 * PII. Restrito a ADMIN. Nunca cacheado (snapshot ao vivo).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const metrics = await collectSystemMetrics();
    return NextResponse.json(apiResponse(metrics), {
      headers: { 'Cache-Control': 'no-store, no-cache' },
    });
  } catch (err) {
    console.error('GET /admin/observability/metrics', err);
    return NextResponse.json(apiResponse(null, 'Erro ao coletar metricas de observabilidade.'), {
      status: 500,
    });
  }
}
