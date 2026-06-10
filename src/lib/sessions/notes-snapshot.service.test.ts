// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock prisma (usado por notesSnapshotService).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    sessionNoteSnapshot: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { notesSnapshotService, __testing } from './notes-snapshot.service';

const mockPrisma = vi.mocked(prisma, true);

const SESSION_ID = 'session-1';
const STUDENT_ID = 'student-1';
const OTHER_ID = 'intruder-1';
const ADMIN_ID = 'admin-1';

describe('notes-snapshot.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('permissao (RBAC §12.5)', () => {
    it('autoriza o aluno dono da sessao a listar', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: SESSION_ID,
        studentId: STUDENT_ID,
      } as never);
      mockPrisma.sessionNoteSnapshot.findMany.mockResolvedValue([] as never);

      const result = await notesSnapshotService.listSnapshots(SESSION_ID, STUDENT_ID);

      expect(result.status).toBe('ok');
      // Owner nao dispara consulta de role.
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('autoriza um ADMIN que nao e dono da sessao', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: SESSION_ID,
        studentId: STUDENT_ID,
      } as never);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' } as never);
      mockPrisma.sessionNoteSnapshot.findMany.mockResolvedValue([] as never);

      const result = await notesSnapshotService.listSnapshots(SESSION_ID, ADMIN_ID);

      expect(result.status).toBe('ok');
    });

    it('nega usuario que nao e dono nem admin (forbidden)', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: SESSION_ID,
        studentId: STUDENT_ID,
      } as never);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'STUDENT' } as never);

      const result = await notesSnapshotService.listSnapshots(SESSION_ID, OTHER_ID);

      expect(result.status).toBe('forbidden');
      expect(mockPrisma.sessionNoteSnapshot.findMany).not.toHaveBeenCalled();
    });

    it('retorna not_found quando a sessao nao existe', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null as never);

      const result = await notesSnapshotService.listSnapshots(SESSION_ID, STUDENT_ID);

      expect(result.status).toBe('not_found');
    });

    it('bloqueia createSnapshot para usuario nao autorizado', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: SESSION_ID,
        studentId: STUDENT_ID,
      } as never);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'STUDENT' } as never);

      const result = await notesSnapshotService.createSnapshot(SESSION_ID, OTHER_ID);

      expect(result.status).toBe('forbidden');
      expect(mockPrisma.sessionNoteSnapshot.create).not.toHaveBeenCalled();
    });
  });

  describe('ordenacao temporal', () => {
    it('lista snapshots do mais recente para o mais antigo (version desc)', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: SESSION_ID,
        studentId: STUDENT_ID,
      } as never);
      mockPrisma.sessionNoteSnapshot.findMany.mockResolvedValue([
        {
          id: 's3',
          version: 3,
          createdById: STUDENT_ID,
          createdAt: new Date('2026-05-03T00:00:00Z'),
          metadata: { plainTextLength: 30, yjsByteLength: 0, documentUpdatedAt: null },
        },
        {
          id: 's2',
          version: 2,
          createdById: STUDENT_ID,
          createdAt: new Date('2026-05-02T00:00:00Z'),
          metadata: { plainTextLength: 20, yjsByteLength: 0, documentUpdatedAt: null },
        },
        {
          id: 's1',
          version: 1,
          createdById: STUDENT_ID,
          createdAt: new Date('2026-05-01T00:00:00Z'),
          metadata: { plainTextLength: 10, yjsByteLength: 0, documentUpdatedAt: null },
        },
      ] as never);

      const result = await notesSnapshotService.listSnapshots(SESSION_ID, STUDENT_ID);

      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.snapshots.map((s) => s.version)).toEqual([3, 2, 1]);

      // A query pediu ordenacao decrescente por versao ao Prisma.
      const call = mockPrisma.sessionNoteSnapshot.findMany.mock.calls[0][0];
      expect(call).toMatchObject({ orderBy: { version: 'desc' } });
    });
  });

  describe('idempotencia por sessao/versao', () => {
    function mockOwnerSessionWithDocument(plainText: string | null) {
      mockPrisma.session.findUnique
        // 1a chamada: authorize (id + studentId)
        .mockResolvedValueOnce({ id: SESSION_ID, studentId: STUDENT_ID } as never)
        // 2a chamada: createSnapshot (id + document)
        .mockResolvedValueOnce({
          id: SESSION_ID,
          document: plainText === null
            ? null
            : { plainTextSnapshot: plainText, yjsState: null, updatedAt: new Date('2026-05-01T00:00:00Z') },
        } as never);
    }

    it('cria a primeira versao quando nao ha snapshot anterior', async () => {
      mockOwnerSessionWithDocument('conteudo do caderno');
      mockPrisma.sessionNoteSnapshot.findFirst.mockResolvedValue(null as never);
      mockPrisma.sessionNoteSnapshot.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'new-1',
          createdAt: new Date('2026-05-04T00:00:00Z'),
          ...data,
        })) as never);

      const result = await notesSnapshotService.createSnapshot(SESSION_ID, STUDENT_ID);

      expect(result.status).toBe('created');
      if (result.status !== 'created') return;
      expect(result.snapshot.version).toBe(1);
      expect(mockPrisma.sessionNoteSnapshot.create).toHaveBeenCalledTimes(1);
    });

    it('reaproveita o ultimo snapshot quando o conteudo nao mudou (unchanged)', async () => {
      const plainText = 'conteudo identico';
      const hash = __testing.computeContentHash(plainText, null);
      mockOwnerSessionWithDocument(plainText);
      mockPrisma.sessionNoteSnapshot.findFirst.mockResolvedValue({
        id: 'prev-1',
        version: 4,
        contentHash: hash,
        createdById: STUDENT_ID,
        createdAt: new Date('2026-05-04T00:00:00Z'),
        plainTextSnapshot: plainText,
        yjsState: null,
        metadata: null,
      } as never);

      const result = await notesSnapshotService.createSnapshot(SESSION_ID, STUDENT_ID);

      expect(result.status).toBe('unchanged');
      if (result.status !== 'unchanged') return;
      expect(result.snapshot.version).toBe(4);
      expect(mockPrisma.sessionNoteSnapshot.create).not.toHaveBeenCalled();
    });

    it('incrementa a versao quando o conteudo mudou', async () => {
      mockOwnerSessionWithDocument('conteudo novo e diferente');
      mockPrisma.sessionNoteSnapshot.findFirst.mockResolvedValue({
        id: 'prev-1',
        version: 4,
        contentHash: __testing.computeContentHash('conteudo antigo', null),
        createdById: STUDENT_ID,
        createdAt: new Date('2026-05-04T00:00:00Z'),
        plainTextSnapshot: 'conteudo antigo',
        yjsState: null,
        metadata: null,
      } as never);
      mockPrisma.sessionNoteSnapshot.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'new-5',
          createdAt: new Date('2026-05-05T00:00:00Z'),
          ...data,
        })) as never);

      const result = await notesSnapshotService.createSnapshot(SESSION_ID, STUDENT_ID);

      expect(result.status).toBe('created');
      if (result.status !== 'created') return;
      expect(result.snapshot.version).toBe(5);
    });

    it('guarda metadata e payload suficiente para restore', async () => {
      mockOwnerSessionWithDocument('texto para restore');
      mockPrisma.sessionNoteSnapshot.findFirst.mockResolvedValue(null as never);
      mockPrisma.sessionNoteSnapshot.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-1', createdAt: new Date(), ...data })) as never);

      const result = await notesSnapshotService.createSnapshot(SESSION_ID, STUDENT_ID);

      expect(result.status).toBe('created');
      if (result.status !== 'created') return;
      // Payload de restore presente.
      expect(result.snapshot.plainTextSnapshot).toBe('texto para restore');
      // Metadata de auditoria persistida.
      expect(result.snapshot.metadata).toMatchObject({
        plainTextLength: 'texto para restore'.length,
        yjsByteLength: 0,
        documentUpdatedAt: '2026-05-01T00:00:00.000Z',
      });
    });
  });

  describe('computeContentHash', () => {
    it('produz o sentinel EMPTY para documento vazio', () => {
      expect(__testing.computeContentHash(null, null)).toBe('EMPTY');
      expect(__testing.computeContentHash('', null)).toBe('EMPTY');
    });

    it('e estavel para o mesmo conteudo e divergente para conteudos distintos', () => {
      const a = __testing.computeContentHash('mesmo texto', null);
      const b = __testing.computeContentHash('mesmo texto', null);
      const c = __testing.computeContentHash('texto diferente', null);
      expect(a).toBe(b);
      expect(a).not.toBe(c);
    });
  });
});
