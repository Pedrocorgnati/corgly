import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from '../helpers/auth'

test.describe('E2E-002: Login + dashboard (aluno autenticado)', () => {
  test('login com credenciais válidas → dashboard com dados corretos', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon'))
        consoleErrors.push(msg.text())
    })

    await loginAs(page, TEST_USERS.student)

    // Verifica redirecionamento para dashboard
    await expect(page).toHaveURL(/dashboard/)

    // CreditWidget visível
    await expect(page.locator('[data-testid="credit-widget"]')).toBeVisible({ timeout: 10_000 })

    // Sidebar com links esperados
    for (const label of [/agendar|schedule/i, /histórico|history/i, /comprar|buy/i]) {
      await expect(page.locator('nav, aside').filter({ hasText: label }).first()).toBeVisible()
    }

    // Sem erros de console não tratados
    const unhandled = consoleErrors.filter((e) => e.toLowerCase().includes('unhandled'))
    expect(unhandled).toHaveLength(0)
  })

  test('login com senha errada retorna erro', async ({ page }) => {
    await page.goto('/auth/login')
    await page.locator('input[type="email"]').fill(TEST_USERS.student.email)
    await page.locator('input[type="password"]').fill('SenhaErrada@999')
    await page.locator('button[type="submit"]').click()

    await expect(
      page.locator('[role="alert"], [data-testid="form-error"]').filter({ hasText: /credenciais|inválid|invalid/i }),
    ).toBeVisible({ timeout: 8_000 })

    // Email mantido
    await expect(page.locator('input[type="email"]')).toHaveValue(TEST_USERS.student.email)
  })

  test('rota protegida redireciona para login sem autenticação', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/auth\/login/)
  })

  test('rota /admin redireciona para login se não autenticado', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/auth\/login/)
  })
})
