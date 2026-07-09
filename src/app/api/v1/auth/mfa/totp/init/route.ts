import { NextRequest, NextResponse } from 'next/server';
import { withApiHandler } from '@/lib/api-handler';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { auditLog } from '@/lib/audit/audit-logger';
import { mfaService, MfaError } from '@/services/mfa.service';

/**
 * POST /api/v1/auth/mfa/totp/init
 *
 * Inicia (ou reinicia) o cadastro de MFA TOTP para o admin autenticado.
 * Retorna o segredo base32, a otpauth:// URI (para QR code) e o conjunto de
 * codigos de recuperacao em claro — TODOS exibidos uma unica vez. O cadastro
 * fica PENDENTE ate ser confirmado via POST /api/v1/auth/mfa/verify.
 *
 * AuditLog gravado direto via Prisma (UI/API canonica de auditoria: T-067).
 */
export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const enrollment = await mfaService.initMfaEnrollment(auth.id);

    await auditLog(
      'ADMIN_MFA_ENROLL_INIT',
      { type: 'User', id: auth.id },
      auth.id,
      { recoveryCodesIssued: enrollment.recoveryCodes.length },
    );

    return NextResponse.json(
      apiResponse(
        enrollment,
        null,
        'Cadastro de MFA iniciado. Escaneie o QR code e confirme com um codigo.',
      ),
    );
  } catch (err) {
    if (err instanceof MfaError && err.code === 'MFA_USER_NOT_FOUND') {
      return NextResponse.json(apiResponse(null, 'Usuario nao encontrado.'), {
        status: 404,
      });
    }
    throw err; // 500 padronizado pelo withApiHandler
  }
});
