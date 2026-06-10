import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { notesRecoveryService } from '@/lib/sessions/notes-recovery.service';

/**
 * POST /api/v1/sessions/:id/notes/recover — restaura um snapshot do caderno.
 *
 * Recupera o estado de um `SessionNoteSnapshot` (T-019) por cima do
 * `SessionDocument` corrente. Acao destrutiva e auditada (T-020, PRD §12.3):
 * o documento atual e sobrescrito pelo snapshot selecionado e o evento e
 * registrado em `AuditLog`.
 *
 * Body: { snapshotId: string }
 *
 * Identidade resolvida via `requireAuth` (headers `x-user-id`/`x-user-role`
 * injetados pelo middleware). RBAC delegado ao service (aluno dono OU admin).
 *
 * Status codes:
 *   200 { restoredVersion, documentUpdatedAt } restaurado
 *   400 body invalido (snapshotId ausente)
 *   401 nao autenticado | 403 nao autorizado
 *   404 sessao OU snapshot inexistente
 */
export const POST = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id: sessionId } = await params;

  // Parse defensivo do body: JSON malformado vira 400, nunca 500.
  let snapshotId: unknown;
  try {
    const body = await request.json();
    snapshotId = body?.snapshotId;
  } catch {
    return NextResponse.json(
      apiResponse(null, 'Corpo da requisição inválido.'),
      { status: 400 },
    );
  }

  if (typeof snapshotId !== 'string' || snapshotId.trim().length === 0) {
    return NextResponse.json(
      apiResponse(null, 'O campo "snapshotId" é obrigatório.'),
      { status: 400 },
    );
  }

  const result = await notesRecoveryService.recoverSnapshot(
    sessionId,
    snapshotId,
    auth.id,
  );

  switch (result.status) {
    case 'ok':
      // eslint-disable-next-line no-console
      console.info(
        JSON.stringify({
          event: 'notes_snapshot.recovered',
          sessionId,
          userId: auth.id,
          restoredVersion: result.restoredVersion,
        }),
      );
      return NextResponse.json(
        apiResponse(
          {
            restoredVersion: result.restoredVersion,
            documentUpdatedAt: result.documentUpdatedAt.toISOString(),
          },
          null,
          'Caderno restaurado com sucesso.',
        ),
      );
    case 'snapshot_not_found':
      return NextResponse.json(
        apiResponse(null, 'Snapshot não encontrado.'),
        { status: 404 },
      );
    case 'not_found':
      return NextResponse.json(
        apiResponse(null, 'Sessão não encontrada.'),
        { status: 404 },
      );
    case 'forbidden':
      return NextResponse.json(
        apiResponse(null, 'Acesso negado.'),
        { status: 403 },
      );
  }
});
