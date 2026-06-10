import 'server-only';

import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/constants/enums';
import { auditLog } from '@/lib/audit/audit-logger';

/**
 * Recuperacao e exportacao do caderno pos-aula (T-020, PRD §12.3).
 *
 * Complementa `notes-snapshot.service.ts` (T-019):
 *   recoverSnapshot  restaura um snapshot versionado por cima do
 *                    `SessionDocument` corrente (acao destrutiva, auditada).
 *   exportNotes      gera um arquivo HTML ou Markdown do caderno (documento
 *                    corrente OU um snapshot especifico) pronto para download.
 *
 * RBAC identico ao service de snapshots (§12.5): autorizado se e somente se
 *   1. e o aluno dono da sessao (`Session.studentId == currentUserId`); OU
 *   2. possui papel admin (suporte/professor single-tutor colapsam em ADMIN).
 *
 * Zero Assumido: a plataforma single-tutor nao possui papel TUTOR dedicado; o
 * professor e o suporte sao o mesmo papel `ADMIN`, identico ao mapeamento ja
 * documentado em `notes-snapshot.service.ts`.
 */

/** Formatos de exportacao suportados. */
export type ExportFormat = 'html' | 'markdown';

/** Acao de auditoria registrada na restauracao de snapshot. */
export const RECOVER_AUDIT_ACTION = 'NOTES_SNAPSHOT_RECOVER';

/** Payload de um arquivo de exportacao pronto para download. */
export interface NotesExportFile {
  filename: string;
  contentType: string;
  body: string;
  /** Versao do snapshot exportado, ou null quando e o documento corrente. */
  version: number | null;
}

export type RecoverSnapshotResult =
  | { status: 'ok'; restoredVersion: number; documentUpdatedAt: Date }
  | { status: 'not_found' } // sessao inexistente
  | { status: 'snapshot_not_found' } // snapshot inexistente ou de outra sessao
  | { status: 'forbidden' };

export type ExportNotesResult =
  | { status: 'ok'; file: NotesExportFile }
  | { status: 'not_found' } // sessao inexistente
  | { status: 'snapshot_not_found' } // snapshot inexistente ou de outra sessao
  | { status: 'empty' } // caderno vazio: nada para exportar
  | { status: 'forbidden' };

export interface NotesRecoveryService {
  recoverSnapshot(
    sessionId: string,
    snapshotId: string,
    currentUserId: string,
  ): Promise<RecoverSnapshotResult>;
  exportNotes(
    sessionId: string,
    currentUserId: string,
    options: { format: ExportFormat; snapshotId?: string },
  ): Promise<ExportNotesResult>;
}

/** Escapa os 5 caracteres sensiveis de HTML (anti-XSS no documento exportado). */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Documento HTML autocontido a partir do texto plano do caderno. */
function renderHtml(plainText: string, title: string): string {
  const paragraphs = plainText
    .split(/\r?\n/)
    .map((line) => (line.trim().length === 0 ? '<p>&nbsp;</p>' : `<p>${escapeHtml(line)}</p>`))
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
      h1 { font-size: 1.5rem; border-bottom: 1px solid #e2e2e2; padding-bottom: 0.5rem; }
      p { margin: 0 0 0.75rem; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${paragraphs}
  </body>
</html>
`;
}

/** Markdown simples: titulo + corpo do caderno preservado verbatim. */
function renderMarkdown(plainText: string, title: string): string {
  return `# ${title}\n\n${plainText}\n`;
}

class NotesRecoveryServiceImpl implements NotesRecoveryService {
  /**
   * Resolve a autorizacao de acesso ao caderno de uma sessao.
   *
   * Espelha `NotesSnapshotServiceImpl.authorize`: owner OU admin. Centraliza a
   * regra RBAC compartilhada por recover e export (Zero Fluxos Incompletos).
   */
  private async authorize(
    sessionId: string,
    currentUserId: string,
  ): Promise<{ ok: true } | { ok: false; status: 'not_found' | 'forbidden' }> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, studentId: true },
    });

    if (!session) {
      return { ok: false, status: 'not_found' };
    }

    if (session.studentId === currentUserId) {
      return { ok: true };
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });

    if (user?.role === UserRole.ADMIN) {
      return { ok: true };
    }

    return { ok: false, status: 'forbidden' };
  }

  async recoverSnapshot(
    sessionId: string,
    snapshotId: string,
    currentUserId: string,
  ): Promise<RecoverSnapshotResult> {
    const authz = await this.authorize(sessionId, currentUserId);
    if (!authz.ok) {
      return { status: authz.status };
    }

    const snapshot = await prisma.sessionNoteSnapshot.findUnique({
      where: { id: snapshotId },
      select: {
        id: true,
        sessionId: true,
        version: true,
        plainTextSnapshot: true,
        yjsState: true,
      },
    });

    // O snapshot precisa existir E pertencer a esta sessao (evita restaurar
    // conteudo de uma sessao alheia via id arbitrario).
    if (!snapshot || snapshot.sessionId !== sessionId) {
      return { status: 'snapshot_not_found' };
    }

    // Restaura o snapshot por cima do documento corrente (upsert: cria o
    // SessionDocument se a sessao ainda nao tiver caderno materializado).
    const document = await prisma.sessionDocument.upsert({
      where: { sessionId },
      create: {
        sessionId,
        plainTextSnapshot: snapshot.plainTextSnapshot,
        yjsState: snapshot.yjsState,
      },
      update: {
        plainTextSnapshot: snapshot.plainTextSnapshot,
        yjsState: snapshot.yjsState,
      },
      select: { updatedAt: true },
    });

    // Auditoria (Acceptance: "restaura snapshot selecionado com auditoria").
    await auditLog(
      RECOVER_AUDIT_ACTION,
      { type: 'session_document', id: sessionId },
      currentUserId,
      {
        snapshotId: snapshot.id,
        restoredVersion: snapshot.version,
        restoredAt: document.updatedAt.toISOString(),
      },
    );

    return {
      status: 'ok',
      restoredVersion: snapshot.version,
      documentUpdatedAt: document.updatedAt,
    };
  }

  async exportNotes(
    sessionId: string,
    currentUserId: string,
    options: { format: ExportFormat; snapshotId?: string },
  ): Promise<ExportNotesResult> {
    const authz = await this.authorize(sessionId, currentUserId);
    if (!authz.ok) {
      return { status: authz.status };
    }

    let plainText: string | null;
    let version: number | null;

    if (options.snapshotId) {
      const snapshot = await prisma.sessionNoteSnapshot.findUnique({
        where: { id: options.snapshotId },
        select: { sessionId: true, version: true, plainTextSnapshot: true },
      });
      if (!snapshot || snapshot.sessionId !== sessionId) {
        return { status: 'snapshot_not_found' };
      }
      plainText = snapshot.plainTextSnapshot;
      version = snapshot.version;
    } else {
      const document = await prisma.sessionDocument.findUnique({
        where: { sessionId },
        select: { plainTextSnapshot: true },
      });
      plainText = document?.plainTextSnapshot ?? null;
      version = null;
    }

    if (plainText === null || plainText.trim().length === 0) {
      return { status: 'empty' };
    }

    const label = version === null ? 'atual' : `v${version}`;
    const title = `Caderno da aula (${label})`;
    const baseName = `caderno-${sessionId}-${label}`;

    const file: NotesExportFile =
      options.format === 'html'
        ? {
            filename: `${baseName}.html`,
            contentType: 'text/html; charset=utf-8',
            body: renderHtml(plainText, title),
            version,
          }
        : {
            filename: `${baseName}.md`,
            contentType: 'text/markdown; charset=utf-8',
            body: renderMarkdown(plainText, title),
            version,
          };

    return { status: 'ok', file };
  }
}

export const notesRecoveryService: NotesRecoveryService = new NotesRecoveryServiceImpl();

export const __testing = { escapeHtml, renderHtml, renderMarkdown };
