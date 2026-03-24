import { test, expect } from '@playwright/test'

/**
 * Smoke tests pós-deploy.
 * Executar contra staging ou produção:
 *   PLAYWRIGHT_BASE_URL=https://staging.corgly.app npx playwright test e2e/smoke/
 *   PLAYWRIGHT_BASE_URL=https://corgly.app npx playwright test e2e/smoke/
 *
 * Todos os 5 testes devem passar em < 30 segundos.
 */

test.describe('Smoke tests pós-deploy', () => {
  test('GET /api/health retorna 200 e status healthy', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('healthy')
    expect(body.db).toBe('ok')
    expect(typeof body.timestamp).toBe('string')
    expect(typeof body.latency).toBe('number')
  })

  test('Landing page carrega com h1 visível', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveTitle(/Corgly/i)
  })

  test('Página de login carrega com form visível', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('form')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('GET /api/v1/auth/me retorna 401 sem cookie', async ({ request }) => {
    const response = await request.get('/api/v1/auth/me')
    expect(response.status()).toBe(401)
  })

  test('Rota /admin redireciona para login sem autenticação', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 })
  })
})
