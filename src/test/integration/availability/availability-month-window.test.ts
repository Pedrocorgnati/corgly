/**
 * GAP-08: janela mensal semiaberta contra o banco de teste. Slot e reserva propria
 * na borda UTC, ainda no mes local, entram; os vizinhos fora do mes local saem.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GET as getDisponibilidade } from '@/app/api/v1/availability/route'
import { GET as getDisponibilidadeAdmin } from '@/app/api/v1/admin/availability/route'
import { GET as getSessoes } from '@/app/api/v1/sessions/route'
import { buildRequest, buildAuthRequest } from '../helpers/auth.helper'
import { createTestUser, createTestAdmin, createTestSlot, createTestSession } from '../helpers/db.helper'
import { cleanDatabase, testPrisma } from '../setup'
import { civilMonthWindow, isInCivilWindow } from '@/lib/canonical-timezone-window'
import { CANONICAL_TIMEZONE_SETTING_KEY } from '@/lib/canonical-timezone.shared'
import { getCanonicalTimezone } from '@/lib/canonical-timezone'

type SlotResposta = { id: string; startAt: string }
type SessaoResposta = { id: string; startAt: string }

const FUSO_ALUNO = 'America/Sao_Paulo'
const JANELA = civilMonthWindow('2099-09', FUSO_ALUNO)
const em = (iso: string) => new Date(iso)

beforeAll(async () => {
  await cleanDatabase()
})

afterAll(async () => {
  await cleanDatabase()
})

describe('GAP-08 janela mensal semiaberta no banco de teste', () => {
  it('REGRESSAO: I1 rota publica cobre a borda UTC e o filtro civil fica so com o mes local', async () => {
    expect(JANELA.start.toISOString()).toBe('2099-09-01T03:00:00.000Z')
    expect(JANELA.end.toISOString()).toBe('2099-10-01T03:00:00.000Z')
    expect([JANELA.date, JANELA.until]).toEqual(['2099-09-01', '2099-10-02'])
    const antes = await createTestSlot({ startAt: em('2099-09-01T02:00:00.000Z') })
    const inicio = await createTestSlot({ startAt: em('2099-09-01T03:00:00.000Z') })
    const borda = await createTestSlot({ startAt: em('2099-10-01T02:00:00.000Z') })
    const depois = await createTestSlot({ startAt: em('2099-10-01T03:00:00.000Z') })

    const res = await getDisponibilidade(
      buildRequest('/api/v1/availability', { searchParams: { date: JANELA.date, until: JANELA.until } }),
    )
    expect(res.status).toBe(200)
    const slots = (await res.json()).data as SlotResposta[]
    expect(slots.map((s) => s.id)).toEqual(expect.arrayContaining([antes.id, inicio.id, borda.id, depois.id]))
    const noMes = slots.filter((s) => isInCivilWindow(s.startAt, JANELA)).map((s) => s.id)
    expect(noMes).toEqual(expect.arrayContaining([inicio.id, borda.id]))
    expect(noMes).not.toContain(antes.id)
    expect(noMes).not.toContain(depois.id)
  })

  it('REGRESSAO: I2 reserva propria na borda UTC entra em [start, end - 1 ms] do aluno', async () => {
    const aluno = await createTestUser()
    expect(aluno.timezone).toBe(FUSO_ALUNO)
    const slotDentro = await createTestSlot({ startAt: em('2099-10-01T01:00:00.000Z') })
    const slotFora = await createTestSlot({ startAt: em('2099-10-01T04:00:00.000Z') })
    const dentro = await createTestSession({ studentId: aluno.id, availabilitySlotId: slotDentro.id })
    const fora = await createTestSession({ studentId: aluno.id, availabilitySlotId: slotFora.id })

    const res = await getSessoes(
      buildAuthRequest('/api/v1/sessions', aluno.id, 'STUDENT', {
        searchParams: { from: JANELA.start.toISOString(), to: new Date(JANELA.end.getTime() - 1).toISOString() },
      }),
    )
    expect(res.status).toBe(200)
    const ids = ((await res.json()).data.data as SessaoResposta[]).map((s) => s.id)
    expect(ids).toContain(dentro.id)
    expect(ids).not.toContain(fora.id)
  })

  it('CONTROLE: I3 rota admin le o fuso canonico de app_settings e inclui o slot da borda UTC do mes local', async () => {
    const anterior = await testPrisma.appSetting.findUnique({ where: { key: CANONICAL_TIMEZONE_SETTING_KEY } })
    // Fixture do teste, diferente do default para que o fallback do catch nao passe; nao e a decisao do GAP-07.
    await testPrisma.appSetting.upsert({
      where: { key: CANONICAL_TIMEZONE_SETTING_KEY },
      update: { value: 'America/Manaus' },
      create: { key: CANONICAL_TIMEZONE_SETTING_KEY, value: 'America/Manaus' },
    })
    try {
      expect(await getCanonicalTimezone()).toBe('America/Manaus')
      const janelaAdmin = civilMonthWindow('2099-09', await getCanonicalTimezone())
      expect(janelaAdmin.start.toISOString()).toBe('2099-09-01T04:00:00.000Z')
      expect(janelaAdmin.end.toISOString()).toBe('2099-10-01T04:00:00.000Z')
      expect([janelaAdmin.date, janelaAdmin.until]).toEqual(['2099-09-01', '2099-10-02'])
      const admin = await createTestAdmin()
      const bordaAdmin = await createTestSlot({ startAt: em('2099-10-01T03:30:00.000Z') })
      const foraAdmin = await createTestSlot({ startAt: em('2099-10-01T04:30:00.000Z') })

      const res = await getDisponibilidadeAdmin(
        buildAuthRequest('/api/v1/admin/availability', admin.id, 'ADMIN', {
          searchParams: { date: janelaAdmin.date, until: janelaAdmin.until },
        }),
      )
      expect(res.status).toBe(200)
      const slots = (await res.json()).data as SlotResposta[]
      const noMes = slots.filter((s) => isInCivilWindow(s.startAt, janelaAdmin)).map((s) => s.id)
      expect(noMes).toContain(bordaAdmin.id)
      expect(slots.map((s) => s.id)).toContain(foraAdmin.id)
      expect(noMes).not.toContain(foraAdmin.id)
    } finally {
      if (anterior) {
        await testPrisma.appSetting.update({ where: { key: CANONICAL_TIMEZONE_SETTING_KEY }, data: { value: anterior.value } })
      } else {
        await testPrisma.appSetting.deleteMany({ where: { key: CANONICAL_TIMEZONE_SETTING_KEY } })
      }
    }
  })
})
