// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock prisma (usado por authorizeNotesToken).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  authorizeNotesToken,
  issueNotesToken,
  NOTES_TOKEN_TTL,
} from './notes-token.service';

const mockPrisma = vi.mocked(prisma, true);

const SECRET = 'test-hocuspocus-secret-with-32+-characters-xx';

describe('notes-token.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('HOCUSPOCUS_JWT_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('authorizeNotesToken', () => {
    it('autoriza o estudante dono da sessão ativa (SCHEDULED)', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        studentId: 'student-1',
        status: 'SCHEDULED',
      } as never);

      const res = await authorizeNotesToken({
        sessionId: 'session-1',
        userId: 'student-1',
        role: 'STUDENT',
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.payload).toEqual({
          userId: 'student-1',
          sessionId: 'session-1',
          role: 'STUDENT',
        });
      }
    });

    it('autoriza ADMIN mesmo não sendo o studentId', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        studentId: 'student-1',
        status: 'IN_PROGRESS',
      } as never);

      const res = await authorizeNotesToken({
        sessionId: 'session-1',
        userId: 'admin-9',
        role: 'ADMIN',
      });

      expect(res.ok).toBe(true);
      if (res.ok) expect(res.payload.role).toBe('ADMIN');
    });

    it('retorna 404 quando a sessão não existe', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null as never);

      const res = await authorizeNotesToken({
        sessionId: 'ghost',
        userId: 'student-1',
        role: 'STUDENT',
      });

      expect(res).toEqual({ ok: false, status: 404, reason: 'session_not_found' });
    });

    it('retorna 403 quando não é participante', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        studentId: 'student-1',
        status: 'IN_PROGRESS',
      } as never);

      const res = await authorizeNotesToken({
        sessionId: 'session-1',
        userId: 'outro-aluno',
        role: 'STUDENT',
      });

      expect(res).toEqual({ ok: false, status: 403, reason: 'not_participant' });
    });

    it('retorna 403 quando a sessão não está ativa (COMPLETED)', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        studentId: 'student-1',
        status: 'COMPLETED',
      } as never);

      const res = await authorizeNotesToken({
        sessionId: 'session-1',
        userId: 'student-1',
        role: 'STUDENT',
      });

      expect(res).toEqual({ ok: false, status: 403, reason: 'session_not_active' });
    });
  });

  describe('issueNotesToken', () => {
    it('assina um JWT HS256 com os claims e expiração ~15m', () => {
      const token = issueNotesToken({
        userId: 'student-1',
        sessionId: 'session-1',
        role: 'STUDENT',
      });

      const header = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
      );
      expect(header.alg).toBe('HS256');

      // O token DEVE ser verificável pelo MESMO secret consumido por hocuspocus/server.ts.
      const decoded = jwt.verify(token, SECRET) as {
        userId: string;
        sessionId: string;
        role: string;
        iat: number;
        exp: number;
      };
      expect(decoded.userId).toBe('student-1');
      expect(decoded.sessionId).toBe('session-1');
      expect(decoded.role).toBe('STUDENT');
      // 15m = 900s.
      expect(decoded.exp - decoded.iat).toBe(900);
      expect(NOTES_TOKEN_TTL).toBe('15m');
    });

    it('lança quando HOCUSPOCUS_JWT_SECRET ausente/curto (mapeado a 500 pelo route)', () => {
      vi.stubEnv('HOCUSPOCUS_JWT_SECRET', 'curto');
      expect(() =>
        issueNotesToken({ userId: 'u', sessionId: 's', role: 'STUDENT' }),
      ).toThrow(/HOCUSPOCUS_JWT_SECRET/);
    });
  });
});
