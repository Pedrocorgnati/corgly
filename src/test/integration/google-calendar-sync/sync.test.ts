/**
 * Testes de integracao do sync Google Calendar (item 021).
 *
 * Somente a API externa do Google e simulada. Credencial, ledger, projecao e
 * slots usam o banco real de teste para provar o fluxo completo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testPrisma, cleanDatabase } from '../setup'
import { createTestAdmin, createTestSlot } from '../helpers/db.helper'
import { encryptCredential } from '@/lib/google/credential-crypto'
import type { GoogleCalendarEvent } from '@/lib/google/calendar-client'
import { googleCalendarSyncService } from '@/services/google-calendar-sync.service'

const fetchMock = vi.fn()
let googleEvents: GoogleCalendarEvent[] = []

function futureAt(hours: number): Date {
  const value = new Date(Date.now() + hours * 60 * 60 * 1000)
  value.setUTCSeconds(0, 0)
  return value
}

function timedEvent(
  id: string,
  startAt: Date,
  endAt: Date,
  options: Pick<GoogleCalendarEvent, 'status' | 'transparency'> = {
    status: 'confirmed',
  },
): GoogleCalendarEvent {
  return {
    id,
    status: options.status,
    transparency: options.transparency,
    start: { dateTime: startAt.toISOString() },
    end: { dateTime: endAt.toISOString() },
  }
}

async function connectedProfessor(): Promise<string> {
  const professor = await createTestAdmin()
  await testPrisma.googleCalendarCredential.create({
    data: {
      userId: professor.id,
      refreshTokenEnc: encryptCredential('refresh-token-de-integracao'),
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
    },
  })
  return professor.id
}

async function ageLedger(externalEventId: string): Promise<void> {
  await testPrisma.externalBusyInterval.update({
    where: { externalEventId },
    data: { syncedAt: new Date(Date.now() - 1_000) },
  })
}

beforeEach(() => {
  googleEvents = []
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input)
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(
        JSON.stringify({ access_token: 'access-token-de-integracao', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events?')) {
      return new Response(JSON.stringify({ items: googleEvents }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw new Error(`fetch inesperado no teste de integracao: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id-de-integracao'
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret-de-integracao'
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await cleanDatabase()
})

describe('GoogleCalendarSyncService com banco real', () => {
  it('evento ocupado bloqueia o slot correspondente', async () => {
    const userId = await connectedProfessor()
    const slot = await createTestSlot({ startAt: futureAt(240) })
    googleEvents = [timedEvent('sync-ocupado', slot.startAt, slot.endAt)]

    const result = await googleCalendarSyncService.syncBusyIntervals(userId)

    expect(result.bloqueados).toEqual([slot.id])
    const persisted = await testPrisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slot.id },
    })
    expect(persisted.isBlocked).toBe(true)
    expect(persisted.blockOrigin).toBe('GOOGLE')
  })

  it('evento removido libera o slot e revoga a linha do ledger', async () => {
    const userId = await connectedProfessor()
    const slot = await createTestSlot({ startAt: futureAt(241) })
    googleEvents = [timedEvent('sync-removido', slot.startAt, slot.endAt)]
    await googleCalendarSyncService.syncBusyIntervals(userId)
    await ageLedger('sync-removido')

    googleEvents = []
    const result = await googleCalendarSyncService.syncBusyIntervals(userId)

    expect(result.liberados).toEqual([slot.id])
    const persisted = await testPrisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slot.id },
    })
    expect(persisted.isBlocked).toBe(false)
    expect(persisted.blockOrigin).toBeNull()
    const ledger = await testPrisma.externalBusyInterval.findUniqueOrThrow({
      where: { externalEventId: 'sync-removido' },
    })
    expect(ledger.revokedAt).not.toBeNull()
  })

  it('agenda vazia com ledger vazio nao altera slots', async () => {
    const userId = await connectedProfessor()
    const slot = await createTestSlot({ startAt: futureAt(242) })

    const result = await googleCalendarSyncService.syncBusyIntervals(userId)

    expect(result).toEqual({
      eventosProcessados: 0,
      bloqueados: [],
      liberados: [],
      conflitos: [],
    })
    expect(await testPrisma.externalBusyInterval.count()).toBe(0)
    const persisted = await testPrisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slot.id },
    })
    expect(persisted.isBlocked).toBe(false)
  })

  it('evento transparente novo e ignorado', async () => {
    const userId = await connectedProfessor()
    const slot = await createTestSlot({ startAt: futureAt(243) })
    googleEvents = [
      timedEvent('sync-transparente-novo', slot.startAt, slot.endAt, {
        status: 'confirmed',
        transparency: 'transparent',
      }),
    ]

    const result = await googleCalendarSyncService.syncBusyIntervals(userId)

    expect(result.eventosProcessados).toBe(0)
    expect(await testPrisma.externalBusyInterval.count()).toBe(0)
    const persisted = await testPrisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slot.id },
    })
    expect(persisted.isBlocked).toBe(false)
  })

  it('evento de duas horas bloqueia os tres slots que ele sobrepoe', async () => {
    const userId = await connectedProfessor()
    const eventStart = futureAt(244)
    const slots = await Promise.all([
      createTestSlot({ startAt: eventStart }),
      createTestSlot({ startAt: new Date(eventStart.getTime() + 50 * 60 * 1000) }),
      createTestSlot({ startAt: new Date(eventStart.getTime() + 100 * 60 * 1000) }),
    ])
    googleEvents = [
      timedEvent(
        'sync-duas-horas',
        eventStart,
        new Date(eventStart.getTime() + 2 * 60 * 60 * 1000),
      ),
    ]

    const result = await googleCalendarSyncService.syncBusyIntervals(userId)

    expect(new Set(result.bloqueados)).toEqual(new Set(slots.map((slot) => slot.id)))
    const persisted = await testPrisma.availabilitySlot.findMany({
      where: { id: { in: slots.map((slot) => slot.id) } },
    })
    expect(persisted).toHaveLength(3)
    expect(persisted.every((slot) => slot.isBlocked && slot.blockOrigin === 'GOOGLE')).toBe(true)
  })

  it('evento que passa de opaco para transparente libera o slot', async () => {
    const userId = await connectedProfessor()
    const slot = await createTestSlot({ startAt: futureAt(245) })
    googleEvents = [timedEvent('sync-opaco-transparente', slot.startAt, slot.endAt)]
    await googleCalendarSyncService.syncBusyIntervals(userId)
    await ageLedger('sync-opaco-transparente')

    googleEvents = [
      timedEvent('sync-opaco-transparente', slot.startAt, slot.endAt, {
        status: 'confirmed',
        transparency: 'transparent',
      }),
    ]
    const result = await googleCalendarSyncService.syncBusyIntervals(userId)

    expect(result.liberados).toEqual([slot.id])
    const persisted = await testPrisma.availabilitySlot.findUniqueOrThrow({
      where: { id: slot.id },
    })
    expect(persisted.isBlocked).toBe(false)
    expect(persisted.blockOrigin).toBeNull()
  })
})
