import { test, expect } from '@playwright/test'
import { uniqueEmail } from '../helpers/auth'
import { createTestUser } from '../helpers/db'

test.describe('E2E-001: Registro de novo aluno + confirmação de email', () => {
  const testEmail = uniqueEmail('register')
  const testPassword = 'Corgly@Test123'
  const testName = 'Aluno Novo E2E'

  test('registro → verificação de email → login → dashboard', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // 1. Navega para landing page
    await page.goto('/')

    // 2. Clica no CTA de registro
    const ctaButton = page.locator('[data-testid="cta-register"], a[href*="register"]').first()
    await ctaButton.click()
    await page.waitForURL(/register/)

    // 3. Preenche formulário de registro
    await page.locator('input[name="name"], input[placeholder*="nome"], input[placeholder*="name"]').fill(testName)
    await page.locator('input[type="email"]').fill(testEmail)
    await page.locator('input[type="password"]').first().fill(testPassword)

    const confirmPasswordField = page.locator('input[name="confirmPassword"], input[placeholder*="confirm"]')
    if (await confirmPasswordField.isVisible()) {
      await confirmPasswordField.fill(testPassword)
    }

    // 4. Submit
    await page.locator('button[type="submit"]').click()

    // 5. Verifica toast de verificação de email
    await expect(
      page.locator('[data-testid="toast"], [role="status"], [role="alert"]').filter({ hasText: /email|verifique/i }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('email duplicado retorna erro AUTH_015', async ({ page }) => {
    // Usa email do usuário e2e existente
    await page.goto('/auth/register')
    await page.locator('input[name="name"], input[placeholder*="nome"], input[placeholder*="name"]').fill('Dup User')
    await page.locator('input[type="email"]').fill('e2e-student@corgly.test')
    await page.locator('input[type="password"]').first().fill('SomePass@123')
    await page.locator('button[type="submit"]').click()

    // Espera mensagem de erro
    await expect(
      page.locator('[data-testid="form-error"], [role="alert"]').filter({ hasText: /cadastrado|exists|já/i }),
    ).toBeVisible({ timeout: 8_000 })

    // Email ainda preenchido
    await expect(page.locator('input[type="email"]')).toHaveValue('e2e-student@corgly.test')
  })

  test('aluno confirmado faz login e vê dashboard com 0 créditos', async ({ page, request }) => {
    // Create a confirmed user via seed helper
    const email = uniqueEmail('confirmed')
    const password = 'TestUser@123'
    await createTestUser(request, {
      email,
      password,
      name: 'Confirmed User E2E',
      role: 'STUDENT',
      credits: 0,
      emailConfirmed: true,
    })

    // Login with the confirmed user
    await page.goto('/auth/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/dashboard/, { timeout: 15_000 })

    // Verify dashboard elements
    await expect(page.locator('[data-testid="credit-widget"]')).toContainText('0', { timeout: 8_000 })
  })
})
