import { prisma } from '@/lib/prisma'
import type { SessionDocument } from '@prisma/client'

class SessionDocumentService {
  /**
   * Cria um SessionDocument vazio para a sessão.
   * Normalmente chamado pelo onStoreDocument do Hocuspocus via upsert — use createOrUpdate() em vez disso.
   */
  async createDocument(sessionId: string): Promise<SessionDocument> {
    return prisma.sessionDocument.create({
      data: { sessionId },
    })
  }

  /**
   * Atualiza (ou cria se ainda não existir) o documento com o estado Yjs e plainText.
   * Chamado pelo onStoreDocument do Hocuspocus após cada debounce.
   */
  async updateDocument(sessionId: string, yjsState: Buffer, plainText: string): Promise<void> {
    await prisma.sessionDocument.upsert({
      where: { sessionId },
      create: { sessionId, yjsState, plainTextSnapshot: plainText },
      update: { yjsState, plainTextSnapshot: plainText, updatedAt: new Date() },
    })
  }

  /**
   * Retorna o SessionDocument completo (inclui yjsState binário).
   * Uso interno: carregamento pelo Hocuspocus no onLoadDocument.
   * Retorna null se não existir — não lança erro.
   */
  async getDocument(sessionId: string): Promise<SessionDocument | null> {
    return prisma.sessionDocument.findUnique({ where: { sessionId } })
  }

  /**
   * Retorna apenas o plainTextSnapshot sem expor o yjsState binário.
   * Consumido pelo módulo de histórico de aulas e previews de cards.
   * Critérios BDD:
   *   SUCCESS — retorna { plainText } sem yjsState
   *   EDGE    — documento nunca editado → plainText = '', não lança erro
   *   ERROR   — sessionId inválido → retorna null, não lança 500
   */
  async getReadonlySnapshot(sessionId: string): Promise<{ plainText: string } | null> {
    const doc = await prisma.sessionDocument.findUnique({
      where: { sessionId },
      select: { plainTextSnapshot: true },
    })
    if (!doc) return null
    return { plainText: doc.plainTextSnapshot ?? '' }
  }
}

export const sessionDocumentService = new SessionDocumentService()
