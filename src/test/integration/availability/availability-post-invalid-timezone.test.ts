/**
 * GAP-04, extensao do orquestrador (codex-f1 do GAP-07) - fuso explicito
 * invalido no POST /api/v1/availability.
 *
 * Pendencia `corgly:GAP-07:codex-f1-fuso-explicito-invalido-500:coverage-gap-task`:
 * o `GenerateSlotsSchema` aceita qualquer `timezone` de 1 a 100 caracteres e
 * `availabilityService.generateSlots` repassa o valor a `localTimeToUtc`, onde
 * `Intl.DateTimeFormat` lanca RangeError. O catch da rota devolve 500
 * `Erro interno.` para um erro que e do cliente (400).
 *
 * Caminho real: sem mock de `generateSlots` nem de `localTimeToUtc`.
 *
 *  RED codex-f1: `timezone: 'Mars/Olympus'` com o resto do corpo valido
 *    responde 400 no formato do 400 de schema e nao cria linha.
 *  CONTROLE: o mesmo corpo com fuso valido responde 201 e cria linhas, o que
 *    prova que o 400 vem so do fuso.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { User } from '@prisma/client'
import { POST } from '@/app/api/v1/availability/route'
import { buildAuthRequest } from '../helpers/auth.helper'
import { createTestAdmin } from '../helpers/db.helper'
import { testPrisma, cleanDatabase } from '../setup'

const CORPO_VALIDO = {
  days: [1, 3],
  ranges: [{ start: '09:00', end: '11:00' }],
  weeksAhead: 1,
  timezone: 'America/Sao_Paulo',
}

let admin: User

beforeAll(async () => {
  await cleanDatabase()
  admin = await createTestAdmin()
})

afterAll(async () => {
  await cleanDatabase()
})

function gerar(corpo: unknown) {
  return POST(buildAuthRequest('/api/v1/availability', admin.id, 'ADMIN', { method: 'POST', body: corpo }))
}

describe('POST /api/v1/availability - fuso explicito invalido (GAP-04, codex-f1 do GAP-07)', () => {
  it('RED codex-f1: timezone desconhecido do Intl responde 400 e nao cria slot', async () => {
    const antes = await testPrisma.availabilitySlot.count()

    const res = await gerar({ ...CORPO_VALIDO, timezone: 'Mars/Olympus' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ data: null, error: 'Dados inválidos.', message: 'Fuso horário inválido.' })
    expect(await testPrisma.availabilitySlot.count()).toBe(antes)
  })

  it('CONTROLE: o mesmo corpo com fuso valido responde 201 e cria slots', async () => {
    const antes = await testPrisma.availabilitySlot.count()

    const res = await gerar(CORPO_VALIDO)

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.created).toBeGreaterThanOrEqual(1)
    expect((await testPrisma.availabilitySlot.count()) - antes).toBe(json.data.created)
  })
})
