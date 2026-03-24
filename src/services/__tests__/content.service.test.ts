// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    content: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit/audit-logger', () => ({
  auditLog: vi.fn(),
}));

const ADMIN_ID = 'admin-123';

describe('ContentService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create()', () => {
    it('cria conteúdo com youtubeUrl válida (ARTICLE sem youtubeUrl)', async () => {
      const { prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.content.create).mockResolvedValueOnce({ id: 'c1', title: 'Test' } as never);

      const { contentService } = await import('@/services/content.service');
      const result = await contentService.create(
        { title: 'Test', type: 'ARTICLE', language: 'PT_BR', sortOrder: 0, isPublished: false },
        ADMIN_ID,
      );
      expect(result.id).toBe('c1');
    });

    it('cria conteúdo com youtubeUrl válida de domínio youtube.com', async () => {
      const { prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.content.create).mockResolvedValueOnce({ id: 'c2' } as never);

      const { contentService } = await import('@/services/content.service');
      await expect(
        contentService.create(
          { title: 'Video', type: 'VIDEO', language: 'EN_US', youtubeUrl: 'https://www.youtube.com/watch?v=abc', sortOrder: 0, isPublished: true },
          ADMIN_ID,
        ),
      ).resolves.toBeDefined();
    });

    it('rejeita youtubeUrl de domínio externo → AppError 400 (T-014 SSRF)', async () => {
      const { contentService } = await import('@/services/content.service');
      await expect(
        contentService.create(
          { title: 'Evil', type: 'VIDEO', language: 'PT_BR', youtubeUrl: 'https://evil.com/video', sortOrder: 0, isPublished: false },
          ADMIN_ID,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejeita youtubeUrl HTTP (não HTTPS) → AppError 400', async () => {
      const { contentService } = await import('@/services/content.service');
      await expect(
        contentService.create(
          { title: 'Http', type: 'VIDEO', language: 'PT_BR', youtubeUrl: 'http://www.youtube.com/watch?v=abc', sortOrder: 0, isPublished: false },
          ADMIN_ID,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('delete()', () => {
    it('deleta conteúdo existente com sucesso', async () => {
      const { prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.content.findUnique).mockResolvedValueOnce({ id: 'c1' } as never);
      vi.mocked(prisma.content.delete).mockResolvedValueOnce({} as never);

      const { contentService } = await import('@/services/content.service');
      await expect(contentService.delete('c1', ADMIN_ID)).resolves.toBeUndefined();
      expect(prisma.content.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('lança AppError 404 para conteúdo inexistente', async () => {
      const { prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.content.findUnique).mockResolvedValueOnce(null);

      const { contentService } = await import('@/services/content.service');
      await expect(contentService.delete('not-found', ADMIN_ID)).rejects.toMatchObject({ status: 404 });
    });
  });
});
