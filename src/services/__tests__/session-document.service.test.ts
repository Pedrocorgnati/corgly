// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessionDocumentService } from '../session-document.service'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessionDocument: {
      create: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'

const mockFindUnique = vi.mocked(prisma.sessionDocument.findUnique)
const mockUpsert = vi.mocked(prisma.sessionDocument.upsert)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sessionDocumentService', () => {
  const SESSION_ID = 'session-abc-123'

  describe('getReadonlySnapshot', () => {
    it('SUCCESS — retorna plainText sem expor yjsState binário', async () => {
      mockFindUnique.mockResolvedValue({
        id: '1', sessionId: SESSION_ID,
        plainTextSnapshot: 'Hello world',
        yjsState: Buffer.from([1, 2, 3]),
        createdAt: new Date(), updatedAt: new Date(),
      } as never)

      const result = await sessionDocumentService.getReadonlySnapshot(SESSION_ID)

      expect(result).toEqual({ plainText: 'Hello world' })
      expect(result).not.toHaveProperty('yjsState')
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { sessionId: SESSION_ID },
        select: { plainTextSnapshot: true },
      })
    })

    it('EDGE — documento nunca editado → plainText = "" sem lançar erro', async () => {
      mockFindUnique.mockResolvedValue({
        id: '1', sessionId: SESSION_ID,
        plainTextSnapshot: null,
        yjsState: null,
        createdAt: new Date(), updatedAt: new Date(),
      } as never)

      const result = await sessionDocumentService.getReadonlySnapshot(SESSION_ID)

      expect(result).toEqual({ plainText: '' })
    })

    it('ERROR — sessionId inválido → retorna null, não lança 500', async () => {
      mockFindUnique.mockResolvedValue(null)

      const result = await sessionDocumentService.getReadonlySnapshot('nonexistent-id')

      expect(result).toBeNull()
    })
  })

  describe('updateDocument', () => {
    it('SUCCESS — chama upsert com yjsState e plainText', async () => {
      mockUpsert.mockResolvedValue({} as never)

      const yjsState = Buffer.from([10, 20, 30])
      await sessionDocumentService.updateDocument(SESSION_ID, yjsState, 'My notes')

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: SESSION_ID },
          create: expect.objectContaining({ sessionId: SESSION_ID, yjsState, plainTextSnapshot: 'My notes' }),
          update: expect.objectContaining({ yjsState, plainTextSnapshot: 'My notes' }),
        })
      )
    })
  })

  describe('getDocument', () => {
    it('SUCCESS — retorna SessionDocument completo', async () => {
      const mockDoc = {
        id: '1', sessionId: SESSION_ID,
        plainTextSnapshot: 'content',
        yjsState: Buffer.from([1]),
        createdAt: new Date(), updatedAt: new Date(),
      }
      mockFindUnique.mockResolvedValue(mockDoc as never)

      const result = await sessionDocumentService.getDocument(SESSION_ID)

      expect(result).toEqual(mockDoc)
    })

    it('ERROR — retorna null quando não encontrado', async () => {
      mockFindUnique.mockResolvedValue(null)

      const result = await sessionDocumentService.getDocument('missing-id')

      expect(result).toBeNull()
    })
  })
})
