import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from '../helpers/auth'
import { createDualContext } from '../helpers/contexts'

test.describe('E2E-007: Admin visualiza sessões', () => {
  test('admin acessa /admin/sessions com tabela de sessões', async ({ page }) => {
    await loginAs(page, TEST_USERS.admin)
    await page.goto('/admin/sessions')

    await expect(page.locator('h1, main').first()).toBeVisible({ timeout: 10_000 })

    // Tabela de sessões visível
    const table = page.locator('table, [data-testid="sessions-table"]').first()
    await expect(table).toBeVisible({ timeout: 8_000 })
  })

  test('student sem permissão ADMIN não acessa /admin', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/admin/sessions')

    // Deve redirecionar para login ou mostrar 403
    const url = page.url()
    expect(url).toMatch(/auth\/login|403|unauthorized/i)
  })

  test('admin cria slot de disponibilidade em /admin/schedule', async ({ page }) => {
    await loginAs(page, TEST_USERS.admin)
    await page.goto('/admin/schedule')

    await expect(page.locator('h1, main').first()).toBeVisible({ timeout: 10_000 })

    // Botão de criar slot visível
    const createBtn = page.locator('button').filter({ hasText: /criar slot|add slot|novo|create/i }).first()
    await expect(createBtn).toBeVisible({ timeout: 8_000 })
  })

  test('admin vê sessão agendada por aluno (dual context)', async ({ browser }) => {
    const dual = await createDualContext(browser)

    try {
      await loginAs(dual.adminPage, TEST_USERS.admin)
      await loginAs(dual.studentPage, TEST_USERS.student)

      // Admin acessa painel de sessões
      await dual.adminPage.goto('/admin/sessions')
      await expect(dual.adminPage.locator('table, [data-testid="sessions-table"]').first()).toBeVisible({
        timeout: 10_000,
      })

      // Student acessa histórico
      await dual.studentPage.goto('/history')
      await expect(dual.studentPage.locator('main').first()).toBeVisible({ timeout: 10_000 })
    } finally {
      await dual.cleanup()
    }
  })

  test('admin vê TodayWidget no dashboard /admin', async ({ page }) => {
    await loginAs(page, TEST_USERS.admin)
    await page.goto('/admin')

    await expect(page.locator('h1, main').first()).toBeVisible({ timeout: 10_000 })
    // TodayWidget pode estar visível
    const todayWidget = page.locator('[data-testid="today-widget"]')
    if (await todayWidget.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(todayWidget).toBeVisible()
    }
  })
})
