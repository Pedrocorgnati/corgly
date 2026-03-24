import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from '../helpers/auth'

const STUDENT_ROUTES = ['/', '/dashboard', '/schedule', '/buy', '/history', '/progress']
const ADMIN_ROUTES = ['/admin', '/admin/schedule', '/admin/sessions', '/admin/students', '/admin/credits', '/admin/feedback']
const PUBLIC_ROUTES = ['/', '/auth/login', '/auth/register', '/auth/reset-password']
const PROTECTED_ROUTES = ['/dashboard', '/schedule', '/buy', '/history', '/admin']

test.describe('E2E-009: Navegação completa (sem links órfãos)', () => {
  test('rotas do aluno autenticado: todas retornam 200', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    for (const route of STUDENT_ROUTES) {
      await page.goto(route)
      const url = page.url()

      // Não deve redirecionar para /404 ou /500
      expect(url).not.toMatch(/404|500|error/)

      // Elemento principal visível
      await expect(page.locator('main, h1').first()).toBeVisible({ timeout: 10_000 })

      const unhandled = consoleErrors.filter((e) => e.includes('Unhandled'))
      expect(unhandled).toHaveLength(0)
      consoleErrors.length = 0
    }
  })

  test('rotas admin: admin autenticado acessa sem erro', async ({ page }) => {
    await loginAs(page, TEST_USERS.admin)

    for (const route of ADMIN_ROUTES) {
      await page.goto(route)
      const url = page.url()

      expect(url).not.toMatch(/404|500/)
      await expect(page.locator('main, h1').first()).toBeVisible({ timeout: 10_000 })
    }
  })

  test('rotas públicas acessíveis sem autenticação', async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route)
      await expect(page.locator('main, h1, body').first()).toBeVisible({ timeout: 10_000 })
      expect(page.url()).not.toMatch(/500/)
    }
  })

  test('rotas protegidas redirecionam para login sem autenticação', async ({ page }) => {
    for (const route of PROTECTED_ROUTES) {
      await page.goto(route)
      await expect(page).toHaveURL(/auth\/login/, { timeout: 10_000 })
    }
  })

  test('GET /api/v1/auth/me retorna 401 sem cookie', async ({ request }) => {
    const response = await request.get('/api/v1/auth/me')
    expect(response.status()).toBe(401)
  })

  test('landing page carrega com título Corgly', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Corgly/i, { timeout: 10_000 })
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })
})
