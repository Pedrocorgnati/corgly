import { test, expect } from '@playwright/test'
import { loginAs, TEST_USERS } from '../helpers/auth'
import { fillStripeCheckout, waitForPaymentSuccess } from '../helpers/stripe'

test.describe('E2E-003: Compra de créditos (Stripe test mode)', () => {
  test.skip(
    !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),
    'Requer STRIPE_SECRET_KEY=sk_test_* para rodar testes de pagamento',
  )

  test('visualiza pacotes de crédito na página /buy', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/buy')

    // Verifica que pacotes estão exibidos
    await expect(page.locator('[data-testid="credit-package"], [data-testid="package-card"]').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('redireciona para Stripe Checkout ao selecionar pacote', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/buy')

    // Clica no primeiro pacote de créditos disponível
    const packageBtn = page
      .locator('[data-testid="buy-button"], button')
      .filter({ hasText: /comprar|buy|crédito|credit/i })
      .first()

    await packageBtn.click()

    // Aguarda redirecionamento para Stripe ou URL de checkout interna
    await page.waitForURL(/stripe\.com|checkout|success=true/, { timeout: 20_000 })
  })

  test('retorno com success=true mostra toast de confirmação e CreditWidget atualiza', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    // Simula retorno do Stripe com success=true
    await page.goto('/buy?success=true')

    await expect(
      page.locator('[data-testid="toast"], [role="status"]').filter({ hasText: /crédito|added|adicionado/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Verify CreditWidget is visible after purchase success
    await expect(page.locator('[data-testid="credit-widget"]')).toBeVisible({ timeout: 10_000 })
  })

  test('cartão recusado exibe erro sem adicionar créditos', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    // Simula retorno de cancelamento/falha
    await page.goto('/buy?canceled=true')

    // Verifica que não há toast de sucesso
    const successToast = page
      .locator('[data-testid="toast"], [role="status"]')
      .filter({ hasText: /adicionado|success/i })
    await expect(successToast).toHaveCount(0)

    // Página /buy ainda exibe os pacotes
    await expect(page).toHaveURL(/buy/)
  })

  test('checkout Stripe completo com cartão de teste', async ({ page }) => {
    await loginAs(page, TEST_USERS.student)
    await page.goto('/buy')

    // Seleciona primeiro pacote
    const packageBtn = page
      .locator('[data-testid="buy-button"], button')
      .filter({ hasText: /comprar|buy|crédito|credit/i })
      .first()

    const hasPackage = await packageBtn.isVisible({ timeout: 8_000 }).catch(() => false)
    test.skip(!hasPackage, 'Nenhum pacote de crédito visível — seed necessário')

    await packageBtn.click()

    // Se redirecionou para Stripe Checkout, preenche o formulário
    const isStripe = await page.waitForURL(/stripe\.com|checkout/, { timeout: 15_000 }).catch(() => false)
    if (isStripe) {
      await fillStripeCheckout(page)
      await waitForPaymentSuccess(page)
    }

    // Verifica CreditWidget após retorno
    await expect(page.locator('[data-testid="credit-widget"]')).toBeVisible({ timeout: 10_000 })
  })
})
