import 'server-only';

import { createHash } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/constants/enums';

/**
 * Snapshots versionados do caderno pos-aula (T-019, PRD §12.3).
 *
 * Endpoints `/sessions/{id}/notes/snapshots`:
 *   GET  lista os snapshots autorizados, ordenados do mais recente para o mais
 *        antigo (ordenacao temporal por versao desc).
 *   POST cria um snapshot idempotente por sessao/versao: captura o estado atual
 *        do `SessionDocument` e so cria uma nova versao quando o conteudo mudou
 *        desde a ultima captura (deduplicacao via `contentHash`).
 *
 * RBAC (espelha `session-notes.service.ts`, §12.5). Autorizado se e somente se:
 *   1. e o aluno dono da sessao (`Session.studentId == currentUserId`); OU
 *   2. possui papel admin (suporte/professor single-tutor colapsam em ADMIN).
 *
 * Zero Assumido: a plataforma single-tutor nao possui papel TUTOR dedicado; o
 * professor e o suporte sao o mesmo papel `ADMIN`, identico ao mapeamento ja
 * documentado em `session-notes.service.ts`.
 */

/** Metadata persistida junto de cada snapshot (auditoria + restore hints). */
export interface SnapshotMetadata {
  plainTextLength: number;
  yjsByteLength: number;
  documentUpdatedAt: string | null;
}

/** Item retornado na listagem (sem payload pesado). */
export interface SnapshotListItem {
  id: string;
  version: number;
  createdById: string;
  createdAt: Date;
  metadata: SnapshotMetadata | null;
}

/** Snapshot criado/retornado pelo POST (com payload completo para restore). */
export interface SnapshotRecord {
  id: string;
  version: number;
  contentHash: string;
  createdById: string;
  createdAt: Date;
  plainTextSnapshot: string | null;
  yjsState: Buffer | null;
  metadata: SnapshotMetadata | null;
}

export type ListSnapshotsResult =
  | { status: 'ok'; snapshots: SnapshotListItem[] }
  | { status: 'not_found' }
  | { status: 'forbidden' };

export type CreateSnapshotResult =
  | { status: 'created'; snapshot: SnapshotRecord }
  | { status: 'unchanged'; snapshot: SnapshotRecord }
  | { status: 'not_found' }
  | { status: 'forbidden' };

export interface NotesSnapshotService {
  listSnapshots(sessionId: string, currentUserId: string): Promise<ListSnapshotsResult>;
  createSnapshot(sessionId: string, currentUserId: string): Promise<CreateSnapshotResult>;
}

/**
 * Hash estavel do payload de um documento. Usado como chave de idempotencia:
 * duas capturas com o mesmo texto e o mesmo estado Yjs produzem o mesmo hash,
 * entao a segunda nao gera uma nova versao.
 *
 * Documento ausente (sessao sem caderno) recebe o sentinel `EMPTY`, de modo que
 * snapshots sucessivos de um caderno vazio tambem sao deduplicados.
 */
function computeContentHash(plainText: string | null, yjsState: Buffer | null): string {
  if ((plainText === null || plainText.length === 0) && (yjsState === null || yjsState.length === 0)) {
    return 'EMPTY';
  }
  const hash = createHash('sha256');
  hash.update('text:', 'utf8');
  hash.update(plainText ?? '', 'utf8');
  hash.update('::yjs:', 'utf8');
  if (yjsState && yjsState.length > 0) {
    hash.update(yjsState);
  }
  return hash.digest('hex');
}

class NotesSnapshotServiceImpl implements NotesSnapshotService {
  /**
   * Resolve a autorizacao de acesso aos snapshots de uma sessao.
   *
   * Retorna o `studentId` da sessao quando ela existe (para o ramo de owner),
   * ou um discriminante de erro. Centraliza a regra RBAC compartilhada por GET
   * e POST (Zero Fluxos Incompletos).
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

  async listSnapshots(sessionId: string, currentUserId: string): Promise<ListSnapshotsResult> {
    const authz = await this.authorize(sessionId, currentUserId);
    if (!authz.ok) {
      return { status: authz.status };
    }

    const rows = await prisma.sessionNoteSnapshot.findMany({
      where: { sessionId },
      orderBy: { version: 'desc' }, // mais recente primeiro (ordenacao temporal)
      select: {
        id: true,
        version: true,
        createdById: true,
        createdAt: true,
        metadata: true,
      },
    });

    const snapshots: SnapshotListItem[] = rows.map((row) => ({
      id: row.id,
      version: row.version,
      createdById: row.createdById,
      createdAt: row.createdAt,
      metadata: (row.metadata as SnapshotMetadata | null) ?? null,
    }));

    return { status: 'ok', snapshots };
  }

  async createSnapshot(sessionId: string, currentUserId: string): Promise<CreateSnapshotResult> {
    const authz = await this.authorize(sessionId, currentUserId);
    if (!authz.ok) {
      return { status: authz.status };
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        document: {
          select: { plainTextSnapshot: true, yjsState: true, updatedAt: true },
        },
      },
    });

    // A sessao existe (authorize ja confirmou); guard defensivo de narrowing.
    if (!session) {
      return { status: 'not_found' };
    }

    const plainText = session.document?.plainTextSnapshot ?? null;
    const yjsState = session.document?.yjsState ?? null;
    const documentUpdatedAt = session.document?.updatedAt ?? null;
    const contentHash = computeContentHash(plainText, yjsState);

    const latest = await prisma.sessionNoteSnapshot.findFirst({
      where: { sessionId },
      orderBy: { version: 'desc' },
    });

    // Idempotencia por sessao/versao: documento inalterado reaproveita a versao.
    if (latest && latest.contentHash === contentHash) {
      return { status: 'unchanged', snapshot: toRecord(latest) };
    }

    const nextVersion = (latest?.version ?? 0) + 1;
    const metadata: SnapshotMetadata = {
      plainTextLength: plainText?.length ?? 0,
      yjsByteLength: yjsState?.length ?? 0,
      documentUpdatedAt: documentUpdatedAt ? documentUpdatedAt.toISOString() : null,
    };

    const created = await prisma.sessionNoteSnapshot.create({
      data: {
        sessionId,
        version: nextVersion,
        contentHash,
        plainTextSnapshot: plainText,
        yjsState,
        createdById: currentUserId,
        metadata: metadata as unknown as object,
      },
    });

    return { status: 'created', snapshot: toRecord(created) };
  }
}

/** Normaliza uma linha do Prisma para o shape publico `SnapshotRecord`. */
function toRecord(row: {
  id: string;
  version: number;
  contentHash: string;
  createdById: string;
  createdAt: Date;
  plainTextSnapshot: string | null;
  yjsState: Buffer | null;
  metadata: unknown;
}): SnapshotRecord {
  return {
    id: row.id,
    version: row.version,
    contentHash: row.contentHash,
    createdById: row.createdById,
    createdAt: row.createdAt,
    plainTextSnapshot: row.plainTextSnapshot,
    yjsState: row.yjsState,
    metadata: (row.metadata as SnapshotMetadata | null) ?? null,
  };
}

export const notesSnapshotService: NotesSnapshotService = new NotesSnapshotServiceImpl();

export const __testing = { computeContentHash };
