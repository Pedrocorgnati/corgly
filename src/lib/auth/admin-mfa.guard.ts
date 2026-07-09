import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { apiResponse, getPayloadFromRequest } from '@/lib/auth';
import { auditLog } from '@/lib/audit/audit-logger';
import { isMfaRecent } from '@/lib/auth/mfa-recency';
import { requireAdmin } from '@/lib/auth-guard';
import type { AuthUser } from '@/lib/auth-guard';

/**
 * Exige autenticacao admin COM MFA recente (janela: MFA_RECENT_WINDOW_SECONDS).
 *
 * - Rotas de API (/api/**): retorna 403 JSON { error: "mfa_required" } sem redirect.
 * - Rotas de UI (middleware): o redirect 307 para /auth/mfa/challenge e feito no
 *   middleware (src/middleware.ts), nao aqui; este guard e para route handlers.
 *
 * Grava AuditLog em ADMIN_MFA_CHALLENGE_REQUIRED (acesso negado por MFA antigo).
 * A UI/API canonica de auditoria vem em T-067.
 */
export async function requireAdminWithRecentMfa(
  request: NextRequest,
): Promise<AuthUser | NextResponse> {
  const adminResult = await requireAdmin(request);
  if (adminResult instanceof NextResponse) return adminResult;

  // Extrair mfaAt do JWT (o claim nao e encaminhado como header — ler o payload direto).
  const payload = getPayloadFromRequest(request);

  if (!isMfaRecent(payload?.mfaAt)) {
    await auditLog(
      'ADMIN_MFA_CHALLENGE_REQUIRED',
      { type: 'User', id: adminResult.id },
      adminResult.id,
      { mfaAt: payload?.mfaAt ?? null, reason: 'mfa_stale_or_absent' },
    ).catch(() => {
      // Nunca bloquear a resposta por falha de auditoria (fallback em audit-logger)
    });

    return NextResponse.json(
      { error: 'mfa_required' },
      { status: 403 },
    );
  }

  return adminResult;
}
