import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import {
  authorizeNotesToken,
  issueNotesToken,
} from '@/lib/sessions/notes-token.service';
import { notesTokenResponseSchema } from '@/lib/sessions/notes-token.schema';

/**
 * POST /api/v1/sessions/:id/notes/token — emite o token do caderno Hocuspocus.
 *
 * Emite um JWT curto (HS256, `HOCUSPOCUS_JWT_SECRET`, 15m) que o servidor
 * Hocuspocus (`hocuspocus/server.ts` `onAuthenticate`) já valida. Fecha o
 * placeholder de `SessionPageClient` (token = currentUser.id).
 *
 * Identidade: headers `x-user-id` / `x-user-role` injetados pelo middleware,
 * resolvidos via `requireAuth`. O corpo da request é ignorado (Zero Assumido).
 *
 * Status codes:
 *   200 { token } sucesso
 *   401 não autenticado (delegado a requireAuth)
 *   403 não participante OU sessão não ativa
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

  const authz = await authorizeNotesToken({
    sessionId,
    userId: auth.id,
    role: auth.role,
  });

  if (!authz.ok) {
    // Logging estruturado JSON espelhando hocuspocus/server.ts.
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        event: 'notes_token.denied',
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
    token = issueNotesToken(authz.payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: 'notes_token.error',
        sessionId,
        userId: auth.id,
        reason: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return NextResponse.json(
      apiResponse(null, 'Falha ao emitir token do caderno.'),
      { status: 500 },
    );
  }

  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: 'notes_token.issued',
      sessionId,
      userId: auth.id,
    }),
  );

  return NextResponse.json(apiResponse(notesTokenResponseSchema.parse({ token })));
});
