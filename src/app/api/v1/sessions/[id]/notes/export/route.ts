import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import {
  notesRecoveryService,
  type ExportFormat,
} from '@/lib/sessions/notes-recovery.service';

/**
 * GET /api/v1/sessions/:id/notes/export — exporta o caderno para download.
 *
 * Gera um arquivo HTML ou Markdown do caderno pos-aula (T-020, PRD §12.3),
 * a partir do documento corrente OU de um snapshot especifico, com header
 * `Content-Disposition: attachment` para download direto pelo navegador.
 *
 * Query params:
 *   format=html|md|markdown  (default: markdown)
 *   snapshot=<snapshotId>    (opcional: exporta o snapshot; default: documento corrente)
 *
 * Identidade resolvida via `requireAuth`. RBAC delegado ao service.
 *
 * Status codes:
 *   200 arquivo (text/html | text/markdown) com Content-Disposition: attachment
 *   400 format invalido
 *   401 nao autenticado | 403 nao autorizado
 *   404 sessao OU snapshot inexistente | 404 caderno vazio
 */

/** Normaliza o param `format` para os formatos canonicos suportados. */
function parseFormat(raw: string | null): ExportFormat | null {
  if (raw === null) return 'markdown'; // default
  const value = raw.toLowerCase();
  if (value === 'html') return 'html';
  if (value === 'md' || value === 'markdown') return 'markdown';
  return null;
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
  const url = new URL(request.url);

  const format = parseFormat(url.searchParams.get('format'));
  if (format === null) {
    return NextResponse.json(
      apiResponse(null, 'Formato inválido. Use "html" ou "markdown".'),
      { status: 400 },
    );
  }

  const snapshotId = url.searchParams.get('snapshot') ?? undefined;

  const result = await notesRecoveryService.exportNotes(sessionId, auth.id, {
    format,
    snapshotId,
  });

  switch (result.status) {
    case 'ok':
      return new NextResponse(result.file.body, {
        status: 200,
        headers: {
          'Content-Type': result.file.contentType,
          'Content-Disposition': `attachment; filename="${result.file.filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    case 'empty':
      return NextResponse.json(
        apiResponse(null, 'Caderno vazio: não há conteúdo para exportar.'),
        { status: 404 },
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
