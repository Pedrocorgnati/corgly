import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import {
  notesSnapshotService,
  type SnapshotListItem,
  type SnapshotRecord,
} from '@/lib/sessions/notes-snapshot.service';

/**
 * GET  /api/v1/sessions/:id/notes/snapshots — lista snapshots do caderno.
 * POST /api/v1/sessions/:id/notes/snapshots — cria snapshot idempotente.
 *
 * Snapshots versionados e imutaveis do caderno pos-aula (T-019, PRD §12.3).
 * Identidade resolvida via `requireAuth` (headers `x-user-id`/`x-user-role`
 * injetados pelo middleware). RBAC delegado ao service (aluno dono OU admin).
 *
 * Status codes:
 *   GET  200 { snapshots } | 401 nao autenticado | 403 nao autorizado | 404 sessao inexistente
 *   POST 201 { snapshot } criado | 200 { snapshot } idempotente (sem mudanca)
 *        401 nao autenticado | 403 nao autorizado | 404 sessao inexistente
 */

/** Projecao publica de um item da listagem (sem payload pesado). */
function serializeListItem(item: SnapshotListItem) {
  return {
    id: item.id,
    version: item.version,
    createdById: item.createdById,
    createdAt: item.createdAt.toISOString(),
    metadata: item.metadata,
  };
}

/** Projecao publica do snapshot criado (payload base64 para restore). */
function serializeRecord(record: SnapshotRecord) {
  return {
    id: record.id,
    version: record.version,
    contentHash: record.contentHash,
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    plainTextSnapshot: record.plainTextSnapshot,
    yjsState: record.yjsState ? record.yjsState.toString('base64') : null,
    metadata: record.metadata,
  };
}

export const GET = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id: sessionId } = await params;
  const result = await notesSnapshotService.listSnapshots(sessionId, auth.id);

  switch (result.status) {
    case 'ok':
      return NextResponse.json(
        apiResponse({ snapshots: result.snapshots.map(serializeListItem) }),
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

export const POST = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id: sessionId } = await params;
  const result = await notesSnapshotService.createSnapshot(sessionId, auth.id);

  switch (result.status) {
    case 'created':
      // eslint-disable-next-line no-console
      console.info(
        JSON.stringify({
          event: 'notes_snapshot.created',
          sessionId,
          userId: auth.id,
          version: result.snapshot.version,
        }),
      );
      return NextResponse.json(
        apiResponse({ snapshot: serializeRecord(result.snapshot) }),
        { status: 201 },
      );
    case 'unchanged':
      // Idempotente: documento inalterado desde a ultima captura.
      return NextResponse.json(
        apiResponse(
          { snapshot: serializeRecord(result.snapshot) },
          null,
          'Nenhuma mudança desde o último snapshot.',
        ),
        { status: 200 },
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
