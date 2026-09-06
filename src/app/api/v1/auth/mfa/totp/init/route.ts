import { NextRequest, NextResponse } from 'next/server';
import { withApiHandler } from '@/lib/api-handler';
import { requireAdmin } from '@/lib/auth-guard';
import { hasRecentMfa, rejectStaleMfa } from '@/lib/auth/admin-mfa.guard';
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
 * Step-up: com MFA ja ACTIVE, reconfigurar (novo segredo + novos codigos de
 * recuperacao, invalidando os atuais) exige MFA recente na sessao (claim
 * `mfaAt` dentro de MFA_RECENT_WINDOW_SECONDS), senao 403 `mfa_required`.
 * Sem isso, uma sessao roubada (cookie) sem MFA recente conseguiria trocar o
 * segundo fator. Com status NONE/PENDING a rota continua acessivel apenas com a
 * sessao de senha: o primeiro cadastro por definicao nao tem MFA para exigir e a
 * janela PENDING (segredo gerado, nunca confirmado) e risco aceito.
 *
 * Break-glass (admin perdeu app E codigos de recuperacao): operador apaga a
 * linha de `user_mfa` do usuario e zera `users.mfaEnabled`; o cascade remove
 * `mfa_recovery_codes`. O status volta a NONE e o setup fica acessivel de novo.
 *
 * AuditLog gravado direto via Prisma (UI/API canonica de auditoria: T-067).
 */
export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const current = await mfaService.getMfaStatus(auth.id);
    if (current.status === 'ACTIVE' && !hasRecentMfa(request)) {
      return rejectStaleMfa(request, auth.id);
    }

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
        'Cadastro de MFA iniciado. Escaneie o QR code e confirme com um código.',
      ),
    );
  } catch (err) {
    if (err instanceof MfaError && err.code === 'MFA_USER_NOT_FOUND') {
      return NextResponse.json(apiResponse(null, 'Usuário não encontrado.'), {
        status: 404,
      });
    }
    throw err; // 500 padronizado pelo withApiHandler
  }
});
