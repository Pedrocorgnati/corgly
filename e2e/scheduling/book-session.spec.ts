import { test, expect, type Page } from '@playwright/test'

import { loginAs } from '../helpers/auth'
import {
  cleanupRun,
  disconnectFixtureDb,
  ensureFutureSlot,
  ensureScheduledSession,
  ensureStudent,
  findScheduledSessionId,
  fixtureDateKey,
  type FixtureScheduledSession,
  type FixtureSlot,
  type FixtureStudent,
} from '../helpers/db'

/**
 * E2E-003 - Agendamento de aula.
 *
 * Esta suite dependia de um seed que nunca rodou (as rotas de teste que ele
 * chamava nao existem no produto) e compensava pulando o caso quando nao achava
 * horario, caindo num seletor generico quando nao achava o calendario e, no caso
 * do historico, assertindo so que "algum h1 esta visivel" - verde com a lista
 * vazia, que e exatamente o defeito que ele deveria pegar. Agora cada
 * caso tem aluno, credito, horario e sessao criados em banco antes do navegador
 * abrir, e todo seletor e um testid que existe em `src/`.
 *
 * Serial por escolha: `beforeAll`/`afterAll` rodam uma vez por worker, e com a
 * suite paralela a limpeza de um worker apagaria a fixture do outro no meio da
 * corrida.
 */
test.describe('E2E-003: Agendamento de aula', () => {
  test.describe.configure({ mode: 'serial' })

  const TAG_CALENDARIO = 'calendario'
  const TAG_SLOT = 'slot'
  const TAG_SEM_CREDITO = 'sem-credito'
  const TAG_HISTORICO = 'historico'
  const TAG_FLUXO = 'fluxo'
  const TAGS = [TAG_CALENDARIO, TAG_SLOT, TAG_SEM_CREDITO, TAG_HISTORICO, TAG_FLUXO]

  let alunoCalendario: FixtureStudent
  let slotCalendario: FixtureSlot
  let alunoSlot: FixtureStudent
  let slotSlot: FixtureSlot
  let alunoSemCredito: FixtureStudent
  let slotSemCredito: FixtureSlot
  let agendada: FixtureScheduledSession
  let alunoFluxo: FixtureStudent
  let slotFluxo: FixtureSlot

  /** Leva a agenda ate o mes do horario da fixture e seleciona o dia. */
  async function abrirDiaDaFixture(page: Page, slot: FixtureSlot): Promise<void> {
    await page.goto('/schedule')
    await expect(page.getByTestId('page-schedule')).toBeVisible()
    await expect(page.getByTestId('schedule-calendar-section')).toBeVisible()

    const [ano, mes] = slot.dateKey.split('-').map(Number)
    const [anoHoje, mesHoje] = fixtureDateKey(new Date()).split('-').map(Number)
    const avancos = (ano - anoHoje) * 12 + (mes - mesHoje)
    for (let i = 0; i < avancos; i += 1) {
      await page.getByTestId('calendar-view-next-month-button').click()
    }

    await expect(page.getByTestId(`calendar-view-day-available-${slot.dateKey}`)).toBeVisible()
    await page.getByTestId(`calendar-view-day-${slot.dateKey}`).click()
  }

  test.beforeAll(async () => {
    alunoCalendario = await ensureStudent(TAG_CALENDARIO, 1)
    slotCalendario = await ensureFutureSlot(TAG_CALENDARIO)
    alunoSlot = await ensureStudent(TAG_SLOT, 1)
    slotSlot = await ensureFutureSlot(TAG_SLOT)
    alunoSemCredito = await ensureStudent(TAG_SEM_CREDITO, 0)
    slotSemCredito = await ensureFutureSlot(TAG_SEM_CREDITO)
    agendada = await ensureScheduledSession(TAG_HISTORICO)
    alunoFluxo = await ensureStudent(TAG_FLUXO, 1)
    slotFluxo = await ensureFutureSlot(TAG_FLUXO)
  })

  test.afterAll(async () => {
    for (const tag of TAGS) {
      await cleanupRun(tag)
    }
    await disconnectFixtureDb()
  })

  test.beforeEach(async ({ page, baseURL }) => {
    // O banner de consentimento e fixo no rodape com z-50 e interceptaria os
    // cliques do calendario. Aceitar antes de navegar nao e o objeto do teste.
    await page.context().addCookies([
      {
        name: 'corgly_consent',
        value: 'all',
        url: baseURL ?? 'http://localhost:3000',
      },
    ])
  })

  test('o calendario marca o dia que tem horario disponivel', async ({ page }) => {
    await loginAs(page, alunoCalendario)
    await abrirDiaDaFixture(page, slotCalendario)

    await expect(page.getByTestId('calendar-view')).toBeVisible()
    await expect(page.getByTestId('schedule-slot-list')).toBeVisible()
    await expect(page.getByTestId(`schedule-slot-${slotCalendario.id}`)).toBeVisible()
  })

  test('selecionar o horario abre o modal de confirmacao', async ({ page }) => {
    await loginAs(page, alunoSlot)
    await abrirDiaDaFixture(page, slotSlot)

    await page.getByTestId(`schedule-slot-${slotSlot.id}`).click()
    await page.getByTestId('schedule-confirm-slot-button').click()

    await expect(page.getByTestId('modal-booking-confirm')).toBeVisible()
    await expect(page.getByTestId('modal-booking-confirm-submit-button')).toBeVisible()
  })

  test('aluno sem credito ve o bloqueio e nao chega ao modal', async ({ page }) => {
    await loginAs(page, alunoSemCredito)
    await abrirDiaDaFixture(page, slotSemCredito)

    await expect(page.getByTestId('insufficient-credits-gate')).toBeVisible()
    const horario = page.getByTestId(`schedule-slot-${slotSemCredito.id}`)
    await expect(horario).toBeDisabled()
    // `force` porque o alvo esta desabilitado de proposito: o teste mede que o
    // clique nao abre caminho nenhum, nao a atuabilidade do botao.
    await horario.click({ force: true })

    await expect(page.getByTestId('schedule-confirm-slot-button')).toHaveCount(0)
    await expect(page.getByTestId('modal-booking-confirm')).toHaveCount(0)
  })

  test('sessao agendada aparece em /history com status Agendada', async ({ page }) => {
    await loginAs(page, agendada.student)
    await page.goto('/history')

    await expect(page.getByTestId('page-history')).toBeVisible()
    await expect(page.getByTestId('history-list')).toBeVisible()
    await expect(page.getByTestId(`history-row-${agendada.sessionId}`)).toBeVisible()
    await expect(page.getByTestId(`session-card-${agendada.sessionId}-status`)).toHaveText('Agendada')
  })

  test('confirmar a reserva consome o credito e registra a sessao', async ({ page }) => {
    await loginAs(page, alunoFluxo)
    await abrirDiaDaFixture(page, slotFluxo)

    await page.getByTestId(`schedule-slot-${slotFluxo.id}`).click()
    await page.getByTestId('schedule-confirm-slot-button').click()
    await page.getByTestId('modal-booking-confirm-submit-button').click()

    await expect(page.getByTestId('modal-booking-confirm-success')).toBeVisible()
    // O estado de sucesso nao fecha sozinho: quem dispara o `onSuccess` e o
    // botao de ver historico. Esse `onSuccess` tenta empurrar a rota do
    // historico, mas no mesmo tick de dois `refresh()`, e a navegacao nao
    // acontece de forma confiavel. O que este caso mede e o resultado da
    // reserva, entao a chegada ao historico e feita pela navegacao explicita
    // abaixo e o desvio do redirect esta registrado como finding.
    await page.getByTestId('modal-booking-confirm-history-button').click()
    await expect(page.getByTestId('modal-booking-confirm')).toHaveCount(0)

    const sessaoId = await findScheduledSessionId(alunoFluxo.id)
    expect(sessaoId).not.toBeNull()

    await page.goto('/history')
    await expect(page.getByTestId('page-history')).toBeVisible()
    await expect(page.getByTestId(`history-row-${sessaoId}`)).toBeVisible()
    await expect(page.getByTestId(`session-card-${sessaoId}-status`)).toHaveText('Agendada')

    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-kpi-credits').locator('p').first()).toHaveText('0')
  })
})
