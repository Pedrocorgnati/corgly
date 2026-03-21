import { prisma } from '@/lib/prisma';
import type { CreateContentInput, UpdateContentInput } from '@/schemas/content.schema';

export class ContentService {
  async list(language?: string) {
    // TODO: Implementar via /auto-flow execute
    return [];
  }

  async create(data: CreateContentInput) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async update(contentId: string, data: UpdateContentInput) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async delete(contentId: string) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    throw new Error('Not implemented - run /auto-flow execute');
  }
}

export const contentService = new ContentService();
