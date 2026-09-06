import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { apiResponse, getPayloadFromRequest } from '@/lib/auth';
import { auditLog } from '@/lib/audit/audit-logger';
import { isMfaRecent } from '@/lib/auth/mfa-recency';
import { isAdminMfaBypassed } from '@/lib/auth/mfa-bypass';
import { requireAdmin } from '@/lib/auth-guard';
import type { AuthUser } from '@/lib/auth-guard';

/** Codigo de maquina devolvido no corpo do 403 (consumido pelo client). */
export const MFA_REQUIRED_CODE = 'mfa_required';

/** Mensagem humana do 403 (exibida como esta no client). */
export const MFA_REQUIRED_MESSAGE =
  'Verificação MFA recente necessária. Confirme um código do app autenticador ou um código de recuperação e tente novamente.';

/**
 * True quando a sessao tem MFA recente (claim `mfaAt` dentro da janela) OU
 * quando o bypass de desenvolvimento esta ativo (ver mfa-bypass.ts).
 *
 * Le o claim direto do JWT (cookie): o proxy nao encaminha `mfaAt` como header.
 */
export function hasRecentMfa(request: NextRequest): boolean {
  if (isAdminMfaBypassed()) return true;
  return isMfaRecent(getPayloadFromRequest(request)?.mfaAt);
}

/**
 * Nega a operacao por MFA ausente/antigo: grava AuditLog
 * ADMIN_MFA_CHALLENGE_REQUIRED e devolve 403 no formato apiResponse
 * (`error` humano + `code: 'mfa_required'` para o client redirecionar ao challenge).
 */
export async function rejectStaleMfa(
  request: NextRequest,
  userId: string,
): Promise<NextResponse> {
  const payload = getPayloadFromRequest(request);

  await auditLog(
    'ADMIN_MFA_CHALLENGE_REQUIRED',
    { type: 'User', id: userId },
    userId,
    { mfaAt: payload?.mfaAt ?? null, reason: 'mfa_stale_or_absent' },
  ).catch(() => {
    // Nunca bloquear a resposta por falha de auditoria (fallback em audit-logger)
  });

  return NextResponse.json(
    { ...apiResponse(null, MFA_REQUIRED_MESSAGE), code: MFA_REQUIRED_CODE },
    { status: 403 },
  );
}

/**
 * Exige autenticacao admin COM MFA recente (janela: MFA_RECENT_WINDOW_SECONDS).
 *
 * - Rotas de API (/api/**): retorna 403 JSON { error, code: "mfa_required" } sem redirect.
 * - Rotas de UI: o redirect 307 para /auth/mfa/challenge e feito no proxy
 *   (src/proxy.ts), nao aqui; este guard e para route handlers.
 * - Em desenvolvimento com ADMIN_MFA_DEV_BYPASS=true o requisito de MFA e
 *   ignorado (a autenticacao admin continua obrigatoria).
 *
 * Grava AuditLog em ADMIN_MFA_CHALLENGE_REQUIRED (acesso negado por MFA antigo).
 * A UI/API canonica de auditoria vem em T-067.
 */
export async function requireAdminWithRecentMfa(
  request: NextRequest,
): Promise<AuthUser | NextResponse> {
  const adminResult = await requireAdmin(request);
  if (adminResult instanceof NextResponse) return adminResult;

  if (!hasRecentMfa(request)) {
    return rejectStaleMfa(request, adminResult.id);
  }

  return adminResult;
}
