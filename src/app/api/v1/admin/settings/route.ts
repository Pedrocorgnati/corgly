import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { getCanonicalTimezone } from '@/lib/canonical-timezone';

/**
 * GET /api/v1/admin/settings
 *
 * Configuracao canonica do app (item 018). Hoje expoe apenas o fuso canonico
 * da agenda persistido em app_settings, consumido por useTimezone e pelo
 * AvailabilityEditor para eliminar o literal 'America/Sao_Paulo' duplicado
 * em componente e hook. O prefixo /api/v1/admin ja e coberto por
 * ADMIN_ONLY_PATHS em src/proxy.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const timezone = await getCanonicalTimezone();
  return NextResponse.json(apiResponse({ timezone }));
}
