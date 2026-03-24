import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import type { HocuspocusAuthPayload } from '../src/types/sala-virtual'

const prisma = new PrismaClient()

const HOCUSPOCUS_JWT_SECRET = process.env.HOCUSPOCUS_JWT_SECRET
if (!HOCUSPOCUS_JWT_SECRET || HOCUSPOCUS_JWT_SECRET.length < 32) {
  console.error(JSON.stringify({ event: 'hocuspocus.startup.error', reason: 'HOCUSPOCUS_JWT_SECRET not configured or too short' }))
  process.exit(1)
}

/** Extrai sessionId a partir do documentName (formato: 'session-{uuid}') */
function getSessionId(documentName: string): string {
  return documentName.replace(/^session-/, '')
}

const server = Server.configure({
  port: 1234,
  debounce: 2000,
  maxDebounce: 10000,

  // ST002 — Autenticação via JWT + validação de participante
  async onAuthenticate({ token, documentName }) {
    const sessionId = getSessionId(documentName)
    let payload: HocuspocusAuthPayload

    try {
      payload = jwt.verify(token, HOCUSPOCUS_JWT_SECRET!) as unknown as HocuspocusAuthPayload
    } catch (err) {
      const reason = err instanceof Error ? err.constructor.name : 'unknown'
      console.info(JSON.stringify({ event: 'hocuspocus.auth.failed', reason, sessionId }))
      throw new Error('Unauthorized')
    }

    // Validar que sessionId do documentName bate com o payload ou que é participante
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { studentId: true, status: true },
    })

    if (!session) {
      console.info(JSON.stringify({ event: 'hocuspocus.auth.failed', reason: 'session_not_found', sessionId }))
      throw new Error('Session not found')
    }

    const isParticipant = session.studentId === payload.userId || payload.role === 'ADMIN'
    if (!isParticipant) {
      console.info(JSON.stringify({ event: 'hocuspocus.auth.failed', reason: 'not_participant', sessionId, userId: payload.userId }))
      throw new Error('Unauthorized')
    }

    // RESOLVED: Hocuspocus sem validação de session status — rejeitar sessões finalizadas
    const allowedStatuses = ['SCHEDULED', 'IN_PROGRESS']
    if (!allowedStatuses.includes(session.status)) {
      console.info(JSON.stringify({ event: 'hocuspocus.auth.failed', reason: 'session_not_active', sessionId, status: session.status }))
      throw new Error('Session is not active')
    }

    console.info(JSON.stringify({ event: 'hocuspocus.auth.success', userId: payload.userId, sessionId }))
    return { userId: payload.userId, sessionId, role: payload.role }
  },

  // ST003 — Carrega yjsState do MySQL ao abrir documento
  async onLoadDocument({ document, documentName }) {
    const sessionId = getSessionId(documentName)

    const doc = await prisma.sessionDocument.findUnique({
      where: { sessionId },
      select: { yjsState: true },
    })

    if (doc?.yjsState) {
      Y.applyUpdate(document, new Uint8Array(doc.yjsState as Buffer))
      console.info(JSON.stringify({ event: 'hocuspocus.document.loaded', sessionId, sizeBytes: (doc.yjsState as Buffer).length }))
    } else {
      console.info(JSON.stringify({ event: 'hocuspocus.document.new', sessionId }))
    }
  },

  // ST003 — Persiste yjsState + plainTextSnapshot no MySQL (debounced 2s / force 10s)
  async onStoreDocument({ document, documentName }) {
    const sessionId = getSessionId(documentName)
    const t0 = Date.now()

    const yjsState = Buffer.from(Y.encodeStateAsUpdate(document))
    const plainTextSnapshot = document.getText('default')?.toString() ?? ''

    await prisma.sessionDocument.upsert({
      where: { sessionId },
      create: { sessionId, yjsState, plainTextSnapshot },
      update: { yjsState, plainTextSnapshot, updatedAt: new Date() },
    })

    const latencyMs = Date.now() - t0
    console.info(JSON.stringify({ event: 'hocuspocus.document.persisted', sessionId, sizeBytes: yjsState.length, latencyMs }))
  },

  // ST012 — Log estruturado na desconexão final
  async onDisconnect({ documentName, context }) {
    const sessionId = getSessionId(documentName)
    const userId = (context as { userId?: string } | null)?.userId ?? null
    console.info(JSON.stringify({
      event: 'hocuspocus.disconnect',
      sessionId,
      userId,
      timestamp: new Date().toISOString(),
    }))
  },
})

server.listen()
console.info(JSON.stringify({ event: 'hocuspocus.startup', port: 1234, timestamp: new Date().toISOString() }))
