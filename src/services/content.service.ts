import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit/audit-logger';
import type { CreateContentInput, UpdateContentInput } from '@/schemas/content.schema';

const ALLOWED_YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be'];

export class ContentService {
  /** Valida domínio e protocolo da youtubeUrl (THREAT-MODEL T-014 SSRF) */
  private validateYoutubeUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AppError('CONTENT_001', 'youtubeUrl inválida.', 400);
    }
    if (!ALLOWED_YOUTUBE_HOSTS.includes(parsed.hostname)) {
      throw new AppError('CONTENT_002', 'URL deve ser do domínio youtube.com ou youtu.be.', 400);
    }
    if (parsed.protocol !== 'https:') {
      throw new AppError('CONTENT_003', 'URL deve usar HTTPS.', 400);
    }
  }

  async list(language?: string) {
    return prisma.content.findMany({
      where: {
        isPublished: true,
        ...(language ? { language: language as never } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(data: CreateContentInput, adminId: string) {
    if (data.youtubeUrl) {
      this.validateYoutubeUrl(data.youtubeUrl);
    }

    const content = await prisma.content.create({
      data: {
        title: data.title,
        type: data.type,
        youtubeUrl: data.youtubeUrl ?? null,
        description: data.description ?? null,
        transcript: data.transcript ?? null,
        language: data.language,
        sortOrder: data.sortOrder ?? 0,
        isPublished: data.isPublished ?? false,
      },
    });

    // T-013: audit trail para mutations admin
    auditLog('CONTENT_CREATE', { type: 'Content', id: content.id }, adminId);

    return content;
  }

  async update(contentId: string, data: UpdateContentInput, adminId: string) {
    if (data.youtubeUrl) {
      this.validateYoutubeUrl(data.youtubeUrl);
    }

    const existing = await prisma.content.findUnique({ where: { id: contentId } });
    if (!existing) {
      throw new AppError('CONTENT_004', 'Conteúdo não encontrado.', 404);
    }

    const content = await prisma.content.update({
      where: { id: contentId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.youtubeUrl !== undefined && { youtubeUrl: data.youtubeUrl }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.transcript !== undefined && { transcript: data.transcript }),
        ...(data.language !== undefined && { language: data.language }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
      },
    });

    auditLog('CONTENT_UPDATE', { type: 'Content', id: contentId }, adminId);

    return content;
  }

  async delete(contentId: string, adminId: string) {
    const existing = await prisma.content.findUnique({ where: { id: contentId } });
    if (!existing) {
      throw new AppError('CONTENT_004', 'Conteúdo não encontrado.', 404);
    }

    await prisma.content.delete({ where: { id: contentId } });

    auditLog('CONTENT_DELETE', { type: 'Content', id: contentId }, adminId);
  }
}

export const contentService = new ContentService();
