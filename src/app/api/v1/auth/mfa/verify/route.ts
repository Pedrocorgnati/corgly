import { NextRequest, NextResponse } from 'next/server';
import { withApiHandler } from '@/lib/api-handler';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse, signJWT, setAuthCookie } from '@/lib/auth';
import { auditLog } from '@/lib/audit/audit-logger';
import { MfaVerifySchema } from '@/schemas/mfa.schema';
import { mfaService, MfaError, MfaErrorCode } from '@/services/mfa.service';

/**
 * POST /api/v1/auth/mfa/verify
 *
 * Verifica um codigo TOTP de 6 digitos OU um codigo de recuperacao para o admin
 * autenticado. Em caso de sucesso:
 *  - confirma o enrollment pendente (=> MFA ativo), se aplicavel;
 *  - cria "estado MFA recente" na sessao reemitindo o JWT com o claim `mfaAt`
 *    (consumido por T-045 para exigir MFA recente em endpoints sensiveis).
 *
 * AuditLog gravado direto via Prisma (UI/API canonica de auditoria: T-067).
 */
export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const parsed = MfaVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Informe um código válido.'),
      { status: 400 },
    );
  }

  try {
    const result = await mfaService.verifyMfa(auth.id, parsed.data.code);

    // Estado MFA recente na sessao: reemite o JWT com o claim mfaAt.
    const mfaAtSeconds = Math.floor(result.verifiedAtMs / 1000);
    const token = signJWT({
      sub: auth.id,
      role: auth.role,
      version: auth.tokenVersion,
      mfaAt: mfaAtSeconds,
    });

    await auditLog(
      result.justEnrolled ? 'ADMIN_MFA_ENABLED' : 'ADMIN_MFA_VERIFIED',
      { type: 'User', id: auth.id },
      auth.id,
      {
        usedRecoveryCode: result.usedRecoveryCode,
        recoveryCodesRemaining: result.recoveryCodesRemaining,
      },
    );

    const response = NextResponse.json(
      apiResponse(
        {
          enabled: result.enabled,
          status: result.status,
          justEnrolled: result.justEnrolled,
          usedRecoveryCode: result.usedRecoveryCode,
          recoveryCodesRemaining: result.recoveryCodesRemaining,
          mfaVerifiedAt: new Date(result.verifiedAtMs).toISOString(),
        },
        null,
        result.justEnrolled
          ? 'MFA ativado com sucesso.'
          : 'Verificação MFA concluída.',
      ),
    );
    setAuthCookie(response, token);
    return response;
  } catch (err) {
    if (err instanceof MfaError) {
      switch (err.code) {
        case MfaErrorCode.NOT_INITIALIZED:
          return NextResponse.json(
            apiResponse(null, 'MFA não iniciado. Inicie o cadastro antes de verificar.'),
            { status: 409 },
          );
        case MfaErrorCode.CODE_REPLAYED:
          return NextResponse.json(
            apiResponse(null, 'Este código já foi utilizado. Aguarde o próximo código.'),
            { status: 400 },
          );
        case MfaErrorCode.RECOVERY_NOT_AVAILABLE:
          return NextResponse.json(
            apiResponse(null, 'Códigos de recuperação só podem ser usados após ativar o MFA.'),
            { status: 400 },
          );
        case MfaErrorCode.INVALID_CODE:
          return NextResponse.json(
            apiResponse(null, 'Código inválido. Tente novamente.'),
            { status: 400 },
          );
        default:
          return NextResponse.json(
            apiResponse(null, 'Falha na verificação MFA.'),
            { status: 400 },
          );
      }
    }
    throw err; // 500 padronizado pelo withApiHandler
  }
});
