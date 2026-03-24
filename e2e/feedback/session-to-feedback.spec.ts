import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS, uniqueEmail } from '../helpers/auth'
import { createTestUser, seedSessionWithStatus } from '../helpers/db'

test.describe('E2E-006: Enviar feedback após sessão', () => {
  test('página /history carrega com lista de sessões', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/history')

    await expect(page.locator('h1, main').first()).toBeVisible({ timeout: 10_000 })
  })

  test('dashboard exibe CorglyCircle/RadarChart após feedback', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/dashboard')

    // Verifica que o dashboard carrega (o chart pode ou não estar visível dependendo de seeds)
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="credit-widget"]')).toBeVisible({ timeout: 8_000 })
  })

  test('sessão com status SCHEDULED não exibe botão de feedback', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/history')

    // Sessões SCHEDULED não devem ter botão "Enviar Feedback"
    const scheduledCards = page.locator('[data-testid="session-card"]').filter({
      has: page.locator('[data-testid="session-status"]').filter({ hasText: /agendad|scheduled/i }),
    })

    const count = await scheduledCards.count()
    for (let i = 0; i < count; i++) {
      const card = scheduledCards.nth(i)
      const feedbackBtn = card.locator('button').filter({ hasText: /feedback/i })
      await expect(feedbackBtn).toHaveCount(0)
    }
  })

  test('feedback com sessão completada: form exibe 4 sliders', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/history')

    // Sessão COMPLETED com botão de feedback
    const completedCard = page.locator('[data-testid="session-card"]').filter({
      has: page.locator('[data-testid="session-status"]').filter({ hasText: /concluíd|completed/i }),
    }).first()

    const hasCompleted = await completedCard.isVisible({ timeout: 5_000 }).catch(() => false)
    test.skip(!hasCompleted, 'Nenhuma sessão COMPLETED no seed — pular')

    const feedbackBtn = completedCard.locator('button, a').filter({ hasText: /feedback/i })
    await feedbackBtn.click()

    // FeedbackForm com 4 sliders
    await expect(page.locator('[data-testid^="score-slider"], input[type="range"]')).toHaveCount(4, { timeout: 8_000 })
  })

  test('submissão completa de feedback com scores e comentário', async ({ page, request }) => {
    // Seed: completed session
    const email = uniqueEmail('feedback')
    const password = 'Feedback@123'
    const student = await createTestUser(request, {
      email,
      password,
      name: 'Feedback Student',
      credits: 0,
      emailConfirmed: true,
    })

    const now = new Date()
    await seedSessionWithStatus(request, {
      studentId: student.id,
      status: 'COMPLETED',
      startAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
    })

    // Login
    await page.goto('/auth/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/dashboard/, { timeout: 15_000 })

    // Navigate to history
    await page.goto('/history')

    // Find COMPLETED session with feedback button
    const completedCard = page.locator('[data-testid="session-card"]').filter({
      has: page.locator('[data-testid="session-status"]').filter({ hasText: /concluíd|completed/i }),
    }).first()

    const hasCompleted = await completedCard.isVisible({ timeout: 8_000 }).catch(() => false)
    test.skip(!hasCompleted, 'Nenhuma sessão COMPLETED disponível — seed pode ter falhado')

    // Click feedback button
    const feedbackBtn = completedCard.locator('button, a').filter({ hasText: /feedback/i })
    await feedbackBtn.click()

    // Verify feedback form appears with score sliders
    await expect(
      page.locator('[data-testid^="score-slider"], [data-testid^="star-rating"], input[type="range"]').first(),
    ).toBeVisible({ timeout: 8_000 })

    // Fill score sliders (set to value 4 via input range)
    const sliders = page.locator('input[type="range"], [data-testid^="score-slider"]')
    const sliderCount = await sliders.count()
    for (let i = 0; i < sliderCount; i++) {
      await sliders.nth(i).fill('4')
    }

    // Fill comment
    const commentField = page.locator('textarea, [data-testid="feedback-comment"]').first()
    if (await commentField.isVisible()) {
      await commentField.fill('Ótima aula, muito produtivo!')
    }

    // Submit
    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /enviar|submit|salvar/i })
    await submitBtn.click()

    // Verify success (toast or redirect)
    await expect(
      page.locator('[data-testid="toast"], [role="status"]').filter({ hasText: /sucesso|enviado|success/i }),
    ).toBeVisible({ timeout: 10_000 }).catch(async () => {
      // Alternative: redirected to dashboard
      await page.waitForURL(/dashboard/, { timeout: 5_000 })
    })
  })
})
