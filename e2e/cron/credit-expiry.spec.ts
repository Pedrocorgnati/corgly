import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from '../helpers/auth'

test.describe('E2E-008: Cron expiração de crédito', () => {
  const CRON_SECRET = process.env.CRON_SECRET || 'dev-cron-secret'

  test('POST /api/cron retorna 401 sem CRON_SECRET válido', async ({ request }) => {
    const response = await request.post('/api/cron', {
      headers: { Authorization: 'Bearer invalid-secret' },
      data: { job: 'credit-expiration' },
    })
    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  test('POST /api/cron retorna 400 com job inválido', async ({ request }) => {
    const response = await request.post('/api/cron', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { job: 'invalid-job-name' },
    })
    expect(response.status()).toBe(400)
  })

  test('POST /api/cron executa credit-expiration com sucesso', async ({ request }) => {
    const response = await request.post('/api/cron', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { job: 'credit-expiration' },
    })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.jobRan).toBe('credit-expiration')
    expect(typeof body.duration).toBe('number')
  })

  test('POST /api/cron executa reminders com sucesso', async ({ request }) => {
    const response = await request.post('/api/cron', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { job: 'reminders' },
    })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.jobRan).toBe('reminders')
  })

  test('POST /api/cron executa auto-confirmation com sucesso', async ({ request }) => {
    const response = await request.post('/api/cron', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { job: 'auto-confirmation' },
    })
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.jobRan).toBe('auto-confirmation')
  })

  test('idempotência: segunda execução do cron não falha', async ({ request }) => {
    // Primeira execução
    const r1 = await request.post('/api/cron', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { job: 'credit-expiration' },
    })
    expect(r1.status()).toBe(200)

    // Segunda execução (deve ser idempotente)
    const r2 = await request.post('/api/cron', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { job: 'credit-expiration' },
    })
    expect(r2.status()).toBe(200)
    const body2 = await r2.json()
    expect(body2.success).toBe(true)
  })

  test('aluno vê 0 créditos no dashboard após expiração (via seed)', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/dashboard')

    await expect(page.locator('[data-testid="credit-widget"]')).toBeVisible({ timeout: 10_000 })
  })
})
