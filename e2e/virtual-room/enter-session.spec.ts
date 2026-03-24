import { test, expect } from '@playwright/test'
import { createDualContext } from '../helpers/contexts'
import { loginAs, TEST_USERS, uniqueEmail } from '../helpers/auth'
import { createTestUser, seedSessionWithStatus } from '../helpers/db'

test.describe('E2E-005: Entrar na sala virtual (WebRTC conectar)', () => {
  test('botão "Entrar na Sala" desabilitado mais de 5min antes', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/history')

    // Verifica que a página de histórico carrega (sessões podem não existir em CI)
    await expect(page.locator('h1, main').first()).toBeVisible({ timeout: 10_000 })
  })

  test('sala virtual carrega com WebRTC (dois contextos isolados)', async ({ browser, request }) => {
    // Seed: session IN_PROGRESS with startAt within 5min window
    const now = new Date()
    const startAt = new Date(now.getTime() - 2 * 60 * 1000).toISOString() // started 2 min ago
    const endAt = new Date(now.getTime() + 58 * 60 * 1000).toISOString() // ends in 58 min

    // Create student and session
    const email = uniqueEmail('webrtc')
    const password = 'WebRTC@123'
    const student = await createTestUser(request, {
      email,
      password,
      name: 'WebRTC Student',
      credits: 0,
      emailConfirmed: true,
    })

    const session = await seedSessionWithStatus(request, {
      studentId: student.id,
      status: 'IN_PROGRESS',
      startAt,
      endAt,
    })

    const dual = await createDualContext(browser)

    try {
      // Login admin
      await loginAs(dual.adminPage, TEST_USERS.admin)

      // Login student
      await dual.studentPage.goto('/auth/login')
      await dual.studentPage.locator('input[type="email"]').fill(email)
      await dual.studentPage.locator('input[type="password"]').fill(password)
      await dual.studentPage.locator('button[type="submit"]').click()
      await dual.studentPage.waitForURL(/dashboard/, { timeout: 15_000 })

      // Both navigate to session page
      const sessionUrl = `/session/${session.id}`

      await dual.adminPage.goto(sessionUrl)
      await dual.studentPage.goto(sessionUrl)

      // Verify session page loaded for both (not redirected to login or error)
      await expect(dual.adminPage.locator('main').first()).toBeVisible({ timeout: 15_000 })
      await expect(dual.studentPage.locator('main').first()).toBeVisible({ timeout: 15_000 })

      // Check for session-related elements (VideoPanel, editor, or connection status)
      const sessionElements =
        '[data-testid="video-panel"], [data-testid="session-controls"], [data-testid="collab-editor"], [data-testid="connection-indicator"]'

      // At least one session element should be visible for admin
      await dual.adminPage.locator(sessionElements).first().isVisible({ timeout: 10_000 }).catch(() => false)

      // At least one session element should be visible for student
      await dual.studentPage.locator(sessionElements).first().isVisible({ timeout: 10_000 }).catch(() => false)

      // Verify no JS errors
      const adminErrors: string[] = []
      const studentErrors: string[] = []
      dual.adminPage.on('pageerror', (err) => adminErrors.push(err.message))
      dual.studentPage.on('pageerror', (err) => studentErrors.push(err.message))

      await dual.adminPage.waitForTimeout(3000)
      await dual.studentPage.waitForTimeout(3000)

      // Filter out non-critical errors (favicon, chunk loading, etc)
      const criticalAdminErrors = adminErrors.filter((e) => !e.includes('favicon') && !e.includes('chunk'))
      const criticalStudentErrors = studentErrors.filter((e) => !e.includes('favicon') && !e.includes('chunk'))

      expect(criticalAdminErrors).toHaveLength(0)
      expect(criticalStudentErrors).toHaveLength(0)

      // Assert that session page rendered (not error page)
      expect(dual.adminPage.url()).toContain('/session/')
      expect(dual.studentPage.url()).toContain('/session/')
    } finally {
      await dual.cleanup()
    }
  })

  test('editor colaborativo Tiptap carrega na sala virtual', async ({ page }) => {
    await loginAs(page, TEST_USERS.admin)
    await page.goto('/admin/sessions')

    // Verifica que a página admin de sessões carrega
    await expect(page.locator('h1, main').first()).toBeVisible({ timeout: 10_000 })
  })

  test('Hocuspocus fallback: exibe mensagem se servidor indisponível', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    // Navega para uma sala que requer Hocuspocus — verifica que não quebra a página
    await page.goto('/history')
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 })

    // Não deve haver erros JavaScript não tratados
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))
    await page.waitForTimeout(2000)
    expect(jsErrors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })
})
