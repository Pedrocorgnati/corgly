import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import {
  authorizeSessionEntryToken,
  issueSessionEntryToken,
  SESSION_ENTRY_TOKEN_TTL_SECONDS,
} from '@/lib/sessions/session-entry-token.service';
import { sessionEntryTokenResponseSchema } from '@/lib/sessions/session-entry-token.schema';

/**
 * POST /api/v1/sessions/:id/entry-token — emite o token de entrada da sessão.
 *
 * Emite um JWT curto (HS256, `SESSION_ENTRY_TOKEN_SECRET`, 5m), escopado a UMA
 * sessão e válido apenas dentro da janela de acesso. NÃO substitui a auth
 * principal: a identidade vem de `requireAuth` (headers x-user-id / x-user-role
 * injetados pelo middleware). O corpo da request é ignorado (Zero Assumido).
 *
 * Status codes:
 *   200 { token, expiresIn, expiresAt } sucesso
 *   401 não autenticado (delegado a requireAuth)
 *   403 não participante OU sessão não ativa OU fora da janela de acesso
 *   404 sessão não encontrada
 *   500 falha na assinatura do JWT
 */
export const POST = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    // requireAuth já respondeu 401 (identidade ausente ou sessão invalidada).
    return auth;
  }

  const { id: sessionId } = await params;

  const authz = await authorizeSessionEntryToken({
    sessionId,
    userId: auth.id,
    role: auth.role,
  });

  if (!authz.ok) {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        event: 'session_entry_token.denied',
        sessionId,
        userId: auth.id,
        reason: authz.reason,
      }),
    );
    const message =
      authz.status === 404 ? 'Sessão não encontrada.' : 'Acesso negado.';
    return NextResponse.json(apiResponse(null, message), { status: authz.status });
  }

  let token: string;
  try {
    token = issueSessionEntryToken(authz.payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: 'session_entry_token.error',
        sessionId,
        userId: auth.id,
        reason: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return NextResponse.json(
      apiResponse(null, 'Falha ao emitir token de entrada.'),
      { status: 500 },
    );
  }

  const expiresAt = new Date(
    Date.now() + SESSION_ENTRY_TOKEN_TTL_SECONDS * 1000,
  ).toISOString();

  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: 'session_entry_token.issued',
      sessionId,
      userId: auth.id,
    }),
  );

  return NextResponse.json(
    apiResponse(
      sessionEntryTokenResponseSchema.parse({
        token,
        expiresIn: SESSION_ENTRY_TOKEN_TTL_SECONDS,
        expiresAt,
      }),
    ),
  );
});
