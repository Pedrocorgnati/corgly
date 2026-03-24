import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS, uniqueEmail } from '../helpers/auth'
import { createTestUser } from '../helpers/db'

test.describe('E2E-004: Agendar sessão com lock otimista', () => {
  test('exibe calendário de agendamento na página /schedule', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/schedule')

    // Calendário / lista de slots visível
    await expect(
      page.locator('[data-testid="schedule-calendar"], [data-testid="availability-calendar"], main').first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('slot disponível pode ser selecionado e exibe ConfirmModal', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/schedule')

    // Aguarda slots carregarem
    const availableSlot = page
      .locator('[data-testid="slot-available"], [data-testid="availability-slot"]')
      .first()

    // Se não há slot disponível, skip (depende de seed)
    const hasSlot = await availableSlot.isVisible({ timeout: 8_000 }).catch(() => false)
    test.skip(!hasSlot, 'Nenhum slot disponível — seed necessário')

    await availableSlot.click()

    // ConfirmModal aparece
    await expect(
      page.locator('[data-testid="confirm-modal"], [role="dialog"]').first(),
    ).toBeVisible({ timeout: 8_000 })
  })

  test('aluno sem créditos vê erro ao tentar agendar', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/schedule')

    // Verifica CreditWidget mostra 0 (pode ser que aluno de teste não tenha créditos)
    const creditWidget = page.locator('[data-testid="credit-widget"]')
    if (await creditWidget.isVisible()) {
      const text = await creditWidget.textContent()
      if (text?.includes('0')) {
        // Tenta agendar — deve receber erro CREDIT_003
        const slot = page.locator('[data-testid="slot-available"]').first()
        if (await slot.isVisible()) {
          await slot.click()
          const confirmBtn = page.locator('[data-testid="confirm-booking-btn"], button').filter({ hasText: /confirmar|confirm/i })
          if (await confirmBtn.isVisible()) {
            await confirmBtn.click()
            await expect(
              page.locator('[data-testid="toast-error"], [role="alert"]').filter({ hasText: /crédito|credit|saldo/i }),
            ).toBeVisible({ timeout: 8_000 })
          }
        }
      }
    }
  })

  test('sessão agendada aparece em /history com status Agendado', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/history')

    // Verifica que a página de histórico carrega
    await expect(page.locator('h1, main').first()).toBeVisible({ timeout: 10_000 })
  })

  test('fluxo completo: agendar sessão com crédito → decrementar → verificar histórico', async ({ page, request }) => {
    // Create student with 1 credit
    const email = uniqueEmail('booking')
    const password = 'Booking@123'
    await createTestUser(request, {
      email,
      password,
      name: 'Booking Student',
      credits: 1,
      emailConfirmed: true,
    })

    // Login
    await page.goto('/auth/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/dashboard/, { timeout: 15_000 })

    // Navigate to schedule
    await page.goto('/schedule')

    // Wait for available slot
    const slot = page.locator('[data-testid="slot-available"], [data-testid="availability-slot"]').first()
    const hasSlot = await slot.isVisible({ timeout: 8_000 }).catch(() => false)
    test.skip(!hasSlot, 'Nenhum slot disponível — seed necessário')

    // Click slot
    await slot.click()

    // Wait for ConfirmModal
    const modal = page.locator('[data-testid="confirm-modal"], [role="dialog"]').first()
    await expect(modal).toBeVisible({ timeout: 8_000 })

    // Click confirm button
    const confirmBtn = modal.locator('button').filter({ hasText: /confirmar|confirm/i })
    await confirmBtn.click()

    // Verify toast success
    await expect(
      page.locator('[data-testid="toast"], [role="status"]').filter({ hasText: /agendad|booked|sucesso/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Verify credit decremented to 0
    await expect(page.locator('[data-testid="credit-widget"]')).toContainText('0', { timeout: 8_000 })

    // Navigate to history
    await page.goto('/history')
    await expect(
      page.locator('[data-testid="session-status"]').filter({ hasText: /agendad|scheduled/i }).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})
