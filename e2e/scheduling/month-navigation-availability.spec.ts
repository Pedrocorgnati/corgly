import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from '../helpers/auth'
import type { Page } from '@playwright/test'
import type { TestUser } from '../helpers/auth'

/**
 * GAP-005 (item 005 do loop 09-06): o aluno navega para o mes seguinte e ve
 * disponibilidade depois do setimo dia. Ate o GAP-08 a agenda do mes navegado
 * buscava so a janela default de sete dias da rota publica, e o dia 15 aparecia
 * vazio mesmo com slot livre.
 *
 * A fixture e propria: o admin gera pela API um unico slot semanal as 12:10 UTC
 * (minuto fora da grade cheia) ate o dia 15 do mes seguinte, e o `afterAll` apaga
 * so os IDs que nasceram desse POST. Nada de reset global nem de seed.
 *
 * Log so de contagens, datas e IDs de slot.
 */

interface SlotAdmin {
  id: string
  startAt: string
  endAt: string
  isBlocked: boolean
  session: { id: string; status: string } | null
}

const DIA_MS = 24 * 60 * 60 * 1000
const chaveUtc = (instante: number) => new Date(instante).toISOString().slice(0, 10)
const iso = (valor: string) => new Date(valor).toISOString()

const agora = new Date()
const HOJE = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
const ALVO_MS = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 15)
const ALVO = chaveUtc(ALVO_MS)
const ALVO_ISO = `${ALVO}T12:10:00.000Z`
const D = Math.round((ALVO_MS - HOJE) / DIA_MS)
const DOW = new Date(ALVO_MS).getUTCDay()
// generateSlots conta semanas a partir do dia da semana de hoje em UTC:
// `daysUntil = (dayOfWeek - todayDow + 7) % 7` e `daysUntil + week * 7`.
const WEEKS_AHEAD = Math.floor(D / 7) + 1
const DAYS_UNTIL = (DOW - new Date(HOJE).getUTCDay() + 7) % 7
const ESPERADOS = Array.from(
  { length: WEEKS_AHEAD },
  (_, semana) => `${chaveUtc(HOJE + (DAYS_UNTIL + 7 * semana) * DIA_MS)}T12:10:00.000Z`,
)
const ONTEM = chaveUtc(HOJE - DIA_MS)
const ATE = chaveUtc(ALVO_MS + 2 * DIA_MS)
const JANELA = `/api/v1/admin/availability?date=${ONTEM}&until=${ATE}`
const DATAS_ESPERADAS = ESPERADOS.map((e) => e.slice(0, 10)).join(',')

let ANTES: Set<string> | null = null
let DEPOIS: SlotAdmin[] | null = null
let CRIADOS: string[] | null = null
let POST_ENVIADO = false
let ID_ALVO: string | null = null

async function entrar(page: Page, usuario: TestUser, papel: string): Promise<void> {
  try {
    await loginAs(page, usuario)
  } catch (erro) {
    console.log(`LOGIN papel=${papel} path=${new URL(page.url()).pathname}`)
    throw erro
  }
  const path = new URL(page.url()).pathname
  console.log(`LOGIN papel=${papel} path=${path}`)
  expect(path, `login de ${papel} parou no desafio de MFA`).not.toBe('/auth/mfa/challenge')
}

async function listarJanela(page: Page): Promise<SlotAdmin[] | null> {
  const res = await page.request.get(JANELA)
  if (res.status() !== 200) {
    console.log(`GET ${JANELA} status=${res.status()}`)
    return null
  }
  const corpo = (await res.json()) as { data: SlotAdmin[] | null }
  return Array.isArray(corpo.data) ? corpo.data : null
}

function calcularCriados(lista: SlotAdmin[], antes: Set<string>): string[] {
  return lista.filter((s) => !antes.has(s.id) && ESPERADOS.includes(iso(s.startAt))).map((s) => s.id)
}

test.describe('GAP-005: agenda do aluno alem do setimo dia do mes navegado', () => {
  test.describe.configure({ mode: 'serial' })

  test('fixture: admin gera o slot de 12:10 UTC do dia 15 do mes seguinte', async ({ page }) => {
    console.log(
      `FIXTURE ALVO=${ALVO} DOW=${DOW} D=${D} weeksAhead=${WEEKS_AHEAD} janela=${ONTEM}..${ATE} esperados=${DATAS_ESPERADAS}`,
    )
    expect(ESPERADOS, 'o alvo precisa cair numa das semanas geradas').toContain(ALVO_ISO)
    expect(WEEKS_AHEAD).toBeGreaterThanOrEqual(1)
    expect(WEEKS_AHEAD).toBeLessThanOrEqual(12)

    await entrar(page, TEST_USERS.admin, 'admin')

    const antes = await listarJanela(page)
    expect(antes, 'GET admin de ANTES falhou').not.toBeNull()
    const listaAntes = antes as SlotAdmin[]
    ANTES = new Set(listaAntes.map((s) => s.id))
    const colisao = listaAntes.find((s) => iso(s.startAt) === ALVO_ISO)
    expect(colisao?.id, `slot do ALVO ${ALVO_ISO} ja existia antes da fixture`).toBeUndefined()

    POST_ENVIADO = true
    const res = await page.request.post('/api/v1/availability', {
      data: {
        days: [DOW],
        ranges: [{ start: '12:10', end: '13:00' }],
        weeksAhead: WEEKS_AHEAD,
        timezone: 'UTC',
      },
    })
    expect(res.status(), 'POST /api/v1/availability').toBe(201)
    const corpo = (await res.json()) as { data: { created: number; skipped: number } | null }

    const depois = await listarJanela(page)
    expect(depois, 'GET admin de DEPOIS falhou').not.toBeNull()
    const listaDepois = depois as SlotAdmin[]
    DEPOIS = listaDepois
    const criados = calcularCriados(listaDepois, ANTES)
    CRIADOS = criados
    console.log(
      `FIXTURE created=${corpo.data?.created} skipped=${corpo.data?.skipped} CRIADOS=${criados.length} ids=${criados.join(',')}`,
    )
    expect(criados.length, 'CRIADOS precisa bater com data.created').toBe(corpo.data?.created)

    const alvo = listaDepois.find((s) => criados.includes(s.id) && iso(s.startAt) === ALVO_ISO)
    expect(alvo, `slot do ALVO ${ALVO_ISO} ausente de CRIADOS`).toBeDefined()
    expect(alvo?.isBlocked, 'slot do ALVO bloqueado').toBe(false)
    ID_ALVO = alvo?.id ?? null
    console.log(`FIXTURE ID_ALVO=${ID_ALVO}`)
  })

  test('aluno navega ao mes seguinte e ve o slot da fixture no dia 15', async ({ page }, testInfo) => {
    expect(ID_ALVO, 'fixture sem ID_ALVO').not.toBeNull()

    await entrar(page, TEST_USERS.student, 'student')
    await page.goto('/schedule')

    const rotulo = page.getByTestId('calendar-view-month-label')
    await expect(rotulo).toBeVisible({ timeout: 15_000 })
    const rotuloInicial = ((await rotulo.textContent()) ?? '').trim()

    // Fuso: 12:10Z do ALVO precisa ser o proprio ALVO no navegador e no fuso do aluno.
    const navegador = await page.evaluate(() => ({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offset: -new Date().getTimezoneOffset(),
    }))
    const textoFuso = ((await page.getByTestId('schedule-header').locator('p').textContent()) ?? '').trim()
    const candidato = textoFuso.split(/\s+/).pop() ?? ''
    let aluno: string | null = null
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: candidato })
      aluno = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(candidato) ? candidato : null
    } catch {
      aluno = null
    }
    console.log(`FUSO navegador=${navegador.tz} offset=${navegador.offset} aluno=${aluno ?? 'nao-medido'}`)
    if (aluno === null) console.log('fuso do aluno nao medido')
    for (const fuso of aluno === null ? [navegador.tz] : [navegador.tz, aluno]) {
      const dia = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date(`${ALVO}T12:10:00Z`))
      expect(dia, `fuso ${fuso} desloca ${ALVO_ISO} para outro dia civil`).toBe(ALVO)
    }

    // O grid so desenha os dias do mes exibido: o botao do dia 15 so existe no mes certo.
    const diaAlvo = page.getByTestId(`calendar-view-day-${ALVO}`)
    for (let clique = 0; clique < 3 && !(await diaAlvo.isVisible()); clique++) {
      const anterior = ((await rotulo.textContent()) ?? '').trim()
      await page.getByTestId('calendar-view-next-month-button').click()
      await expect(rotulo).toHaveText(
        new RegExp(`^(?!${anterior.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$).+`),
        { timeout: 15_000 },
      )
    }
    await expect(diaAlvo).toBeVisible({ timeout: 15_000 })
    await expect(rotulo).toBeVisible()
    const rotuloFinal = ((await rotulo.textContent()) ?? '').trim()
    expect(rotuloFinal, 'o rotulo precisa mudar para um mes futuro').not.toBe(rotuloInicial)
    console.log(`NAVEGACAO rotulo_inicial=${rotuloInicial} rotulo_final=${rotuloFinal}`)

    await expect(page.getByTestId(`calendar-view-day-available-${ALVO}`)).toBeVisible({ timeout: 15_000 })

    await diaAlvo.click()
    await expect(page.getByTestId('schedule-slot-picker')).toBeVisible()
    await expect(page.getByTestId(`schedule-slot-${ID_ALVO}`)).toBeVisible()

    await page.screenshot({ path: testInfo.outputPath('item-005-month-after-day-7.png'), fullPage: true })
  })

  test.afterAll(async ({ browser }, testInfo) => {
    const antes = ANTES
    if (antes === null) {
      console.log('CONTAGEM ANTES=nao-medido DEPOIS=nao-medido CRIADOS=0 REMOVIDOS=0 FINAL=nao-medido (sem POST)')
      return
    }

    const contexto = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    const page = await contexto.newPage()
    const problemas: string[] = []
    let removidos = 0
    let final: SlotAdmin[] | null = null
    try {
      await entrar(page, TEST_USERS.admin, 'admin')

      let ultimo: SlotAdmin[] | null = DEPOIS
      if (POST_ENVIADO && CRIADOS === null) {
        ultimo = await listarJanela(page)
        if (ultimo === null) {
          throw new Error(`fixture possivelmente orfa: GET do afterAll falhou; ALVO=${ALVO} esperados=${DATAS_ESPERADAS}`)
        }
        CRIADOS = calcularCriados(ultimo, antes)
      }
      const criados = CRIADOS ?? []

      if (POST_ENVIADO && ultimo !== null) {
        for (const s of ultimo.filter((slot) => !antes.has(slot.id) && !criados.includes(slot.id))) {
          problemas.push(`NOVOS fora de CRIADOS (nao removido): ${s.id} ${iso(s.startAt)}`)
        }
      }

      for (const id of criados) {
        const res = await page.request.delete(`/api/v1/availability/${id}`)
        if (res.status() === 204) removidos++
        else problemas.push(`DELETE ${id} status=${res.status()}`)
      }

      final = await listarJanela(page)
      if (final === null) {
        problemas.push(
          `fixture possivelmente orfa: GET final falhou; ALVO=${ALVO} esperados=${DATAS_ESPERADAS} CRIADOS=${criados.join(',')}`,
        )
      } else {
        const idsFinal = new Set(final.map((s) => s.id))
        const sobras = final.filter((s) => !antes.has(s.id))
        const faltas = [...antes].filter((id) => !idsFinal.has(id))
        if (sobras.length > 0 || faltas.length > 0) {
          problemas.push(
            `FINAL diferente de ANTES: sobras=${sobras.map((s) => `${s.id}@${iso(s.startAt)}`).join(',')} faltas=${faltas.join(',')}`,
          )
        }
      }
    } finally {
      console.log(
        `CONTAGEM ANTES=${antes.size} DEPOIS=${DEPOIS?.length ?? 'nao-medido'} CRIADOS=${CRIADOS?.length ?? 0} REMOVIDOS=${removidos} FINAL=${final?.length ?? 'nao-medido'}`,
      )
      await contexto.close()
    }

    for (const p of problemas) console.log(`CLEANUP ${p}`)
    expect(problemas, 'cleanup da fixture').toEqual([])
  })
})
