import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, requireStudent } from '@/lib/auth-guard';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';

const mockFindUnique = vi.mocked(prisma.user.findUnique);

// Helper para criar NextRequest com headers
function createRequest(headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest('http://localhost/api/test', {
    headers: new Headers(headers),
  });
  return req;
}

function isNextResponse(result: unknown): result is NextResponse {
  return result instanceof NextResponse;
}

async function getResponseBody(response: NextResponse) {
  return response.json();
}

describe('auth-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('retorna 401 quando headers estão ausentes', async () => {
      const request = createRequest();
      const result = await requireAuth(request);

      expect(isNextResponse(result)).toBe(true);
      if (isNextResponse(result)) {
        expect(result.status).toBe(401);
        const body = await getResponseBody(result);
        expect(body.error).toBe('Não autorizado.');
      }
    });

    it('retorna 401 quando x-user-id está ausente', async () => {
      const request = createRequest({
        'x-user-role': 'STUDENT',
        'x-token-version': '1',
      });
      const result = await requireAuth(request);

      expect(isNextResponse(result)).toBe(true);
      if (isNextResponse(result)) {
        expect(result.status).toBe(401);
      }
    });

    it('retorna 401 quando usuário não existe no banco', async () => {
      mockFindUnique.mockResolvedValue(null);

      const request = createRequest({
        'x-user-id': 'user-123',
        'x-user-role': 'STUDENT',
        'x-token-version': '1',
      });
      const result = await requireAuth(request);

      expect(isNextResponse(result)).toBe(true);
      if (isNextResponse(result)) {
        expect(result.status).toBe(401);
        const body = await getResponseBody(result);
        expect(body.error).toBe('Usuário não encontrado.');
      }
    });

    it('retorna 401 quando tokenVersion não coincide', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'user-123',
        role: 'STUDENT',
        tokenVersion: 2,
      } as never);

      const request = createRequest({
        'x-user-id': 'user-123',
        'x-user-role': 'STUDENT',
        'x-token-version': '1',
      });
      const result = await requireAuth(request);

      expect(isNextResponse(result)).toBe(true);
      if (isNextResponse(result)) {
        expect(result.status).toBe(401);
        const body = await getResponseBody(result);
        expect(body.error).toBe('Sessão invalidada. Faça login novamente.');
      }
    });

    it('retorna AuthUser quando headers e tokenVersion são válidos', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'user-123',
        role: 'STUDENT',
        tokenVersion: 1,
      } as never);

      const request = createRequest({
        'x-user-id': 'user-123',
        'x-user-role': 'STUDENT',
        'x-token-version': '1',
      });
      const result = await requireAuth(request);

      expect(isNextResponse(result)).toBe(false);
      if (!isNextResponse(result)) {
        expect(result.id).toBe('user-123');
        expect(result.role).toBe('STUDENT');
        expect(result.tokenVersion).toBe(1);
      }
    });
  });

  describe('requireAdmin', () => {
    it('retorna AuthUser quando role é ADMIN', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'admin-1',
        role: 'ADMIN',
        tokenVersion: 1,
      } as never);

      const request = createRequest({
        'x-user-id': 'admin-1',
        'x-user-role': 'ADMIN',
        'x-token-version': '1',
      });
      const result = await requireAdmin(request);

      expect(isNextResponse(result)).toBe(false);
      if (!isNextResponse(result)) {
        expect(result.role).toBe('ADMIN');
      }
    });

    it('retorna 403 quando role é STUDENT', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'user-123',
        role: 'STUDENT',
        tokenVersion: 1,
      } as never);

      const request = createRequest({
        'x-user-id': 'user-123',
        'x-user-role': 'STUDENT',
        'x-token-version': '1',
      });
      const result = await requireAdmin(request);

      expect(isNextResponse(result)).toBe(true);
      if (isNextResponse(result)) {
        expect(result.status).toBe(403);
        const body = await getResponseBody(result);
        expect(body.error).toBe('Acesso restrito a administradores.');
      }
    });

    it('retorna 401 quando headers estão ausentes', async () => {
      const request = createRequest();
      const result = await requireAdmin(request);

      expect(isNextResponse(result)).toBe(true);
      if (isNextResponse(result)) {
        expect(result.status).toBe(401);
      }
    });
  });

  describe('requireStudent', () => {
    it('retorna AuthUser quando role é STUDENT', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'user-123',
        role: 'STUDENT',
        tokenVersion: 1,
      } as never);

      const request = createRequest({
        'x-user-id': 'user-123',
        'x-user-role': 'STUDENT',
        'x-token-version': '1',
      });
      const result = await requireStudent(request);

      expect(isNextResponse(result)).toBe(false);
      if (!isNextResponse(result)) {
        expect(result.role).toBe('STUDENT');
      }
    });

    it('retorna 403 quando role é ADMIN', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'admin-1',
        role: 'ADMIN',
        tokenVersion: 1,
      } as never);

      const request = createRequest({
        'x-user-id': 'admin-1',
        'x-user-role': 'ADMIN',
        'x-token-version': '1',
      });
      const result = await requireStudent(request);

      expect(isNextResponse(result)).toBe(true);
      if (isNextResponse(result)) {
        expect(result.status).toBe(403);
        const body = await getResponseBody(result);
        expect(body.error).toBe('Acesso restrito a estudantes.');
      }
    });

    it('retorna 401 quando headers estão ausentes', async () => {
      const request = createRequest();
      const result = await requireStudent(request);

      expect(isNextResponse(result)).toBe(true);
      if (isNextResponse(result)) {
        expect(result.status).toBe(401);
      }
    });
  });
});
