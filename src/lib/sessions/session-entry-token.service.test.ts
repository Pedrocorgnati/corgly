// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock prisma (usado por authorizeSessionEntryToken).
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  authorizeSessionEntryToken,
  issueSessionEntryToken,
  SESSION_ENTRY_TOKEN_TTL,
  SESSION_ENTRY_TOKEN_TTL_SECONDS,
  ENTRY_WINDOW_LEAD_MS,
} from './session-entry-token.service';

const mockPrisma = vi.mocked(prisma, true);

const SECRET = 'test-session-entry-secret-with-32+-characters-xx';

// Janela canônica de teste: sessão das 10:00 às 11:00 UTC.
const START_AT = new Date('2026-06-09T10:00:00.000Z');
const END_AT = new Date('2026-06-09T11:00:00.000Z');
// Dentro da janela (startAt + 5m).
const NOW_INSIDE = new Date('2026-06-09T10:05:00.000Z');
// Antes da janela abrir (mais cedo que startAt - LEAD).
const NOW_BEFORE_WINDOW = new Date(
  START_AT.getTime() - ENTRY_WINDOW_LEAD_MS - 60 * 1000,
);

function mockSession(overrides: Record<string, unknown> = {}) {
  mockPrisma.session.findUnique.mockResolvedValue({
    studentId: 'student-1',
    status: 'SCHEDULED',
    startAt: START_AT,
    endAt: END_AT,
    ...overrides,
  } as never);
}

describe('session-entry-token.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SESSION_ENTRY_TOKEN_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('authorizeSessionEntryToken', () => {
    it('autoriza o estudante dono dentro da janela', async () => {
      mockSession();

      const res = await authorizeSessionEntryToken({
        sessionId: 'session-1',
        userId: 'student-1',
        role: 'STUDENT',
        now: NOW_INSIDE,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.payload).toEqual({
          userId: 'student-1',
          sessionId: 'session-1',
          role: 'STUDENT',
          purpose: 'session-entry',
        });
      }
    });

    it('autoriza o professor (ADMIN) mesmo não sendo o studentId', async () => {
      mockSession({ status: 'IN_PROGRESS' });

      const res = await authorizeSessionEntryToken({
        sessionId: 'session-1',
        userId: 'admin-9',
        role: 'ADMIN',
        now: NOW_INSIDE,
      });

      expect(res.ok).toBe(true);
      if (res.ok) expect(res.payload.role).toBe('ADMIN');
    });

    it('nega (403) antes da janela de acesso abrir', async () => {
      mockSession();

      const res = await authorizeSessionEntryToken({
        sessionId: 'session-1',
        userId: 'student-1',
        role: 'STUDENT',
        now: NOW_BEFORE_WINDOW,
      });

      expect(res).toEqual({
        ok: false,
        status: 403,
        reason: 'outside_access_window',
      });
    });

    it('nega (403) quando é o aluno errado', async () => {
      mockSession();

      const res = await authorizeSessionEntryToken({
        sessionId: 'session-1',
        userId: 'outro-aluno',
        role: 'STUDENT',
        now: NOW_INSIDE,
      });

      expect(res).toEqual({
        ok: false,
        status: 403,
        reason: 'not_participant',
      });
    });

    it('retorna 404 quando a sessão não existe', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null as never);

      const res = await authorizeSessionEntryToken({
        sessionId: 'ghost',
        userId: 'student-1',
        role: 'STUDENT',
        now: NOW_INSIDE,
      });

      expect(res).toEqual({
        ok: false,
        status: 404,
        reason: 'session_not_found',
      });
    });

    it('nega (403) quando a sessão não está ativa (COMPLETED)', async () => {
      mockSession({ status: 'COMPLETED' });

      const res = await authorizeSessionEntryToken({
        sessionId: 'session-1',
        userId: 'student-1',
        role: 'STUDENT',
        now: NOW_INSIDE,
      });

      expect(res).toEqual({
        ok: false,
        status: 403,
        reason: 'session_not_active',
      });
    });
  });

  describe('issueSessionEntryToken', () => {
    it('assina um JWT HS256 curto (~5m) com claim purpose=session-entry', () => {
      const token = issueSessionEntryToken({
        userId: 'student-1',
        sessionId: 'session-1',
        role: 'STUDENT',
        purpose: 'session-entry',
      });

      const header = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
      );
      expect(header.alg).toBe('HS256');

      const decoded = jwt.verify(token, SECRET) as {
        userId: string;
        sessionId: string;
        role: string;
        purpose: string;
        iat: number;
        exp: number;
      };
      expect(decoded.userId).toBe('student-1');
      expect(decoded.sessionId).toBe('session-1');
      expect(decoded.role).toBe('STUDENT');
      expect(decoded.purpose).toBe('session-entry');
      // 5m = 300s. Token expira rapidamente, por design.
      expect(decoded.exp - decoded.iat).toBe(SESSION_ENTRY_TOKEN_TTL_SECONDS);
      expect(SESSION_ENTRY_TOKEN_TTL).toBe('5m');
    });

    it('lança quando SESSION_ENTRY_TOKEN_SECRET ausente/curto (mapeado a 500 pelo route)', () => {
      vi.stubEnv('SESSION_ENTRY_TOKEN_SECRET', 'curto');
      expect(() =>
        issueSessionEntryToken({
          userId: 'u',
          sessionId: 's',
          role: 'STUDENT',
          purpose: 'session-entry',
        }),
      ).toThrow(/SESSION_ENTRY_TOKEN_SECRET/);
    });
  });
});
