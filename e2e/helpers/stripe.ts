import type { Page } from '@playwright/test'

/** Cartões de teste Stripe */
export const STRIPE_CARDS = {
  /** Pagamento bem-sucedido */
  success: {
    number: '4242 4242 4242 4242',
    expiry: '12/30',
    cvc: '123',
    zip: '12345',
  },
  /** Cartão recusado */
  declined: {
    number: '4000 0000 0000 0002',
    expiry: '12/30',
    cvc: '123',
    zip: '12345',
  },
  /** Requer autenticação 3DS */
  requires3ds: {
    number: '4000 0027 6000 3184',
    expiry: '12/30',
    cvc: '123',
    zip: '12345',
  },
}

/**
 * Preenche o formulário de pagamento do Stripe Checkout (iframe).
 * Aguarda o iframe do Stripe carregar antes de preencher.
 */
export async function fillStripeCheckout(
  page: Page,
  card = STRIPE_CARDS.success,
): Promise<void> {
  // Aguarda o Stripe Checkout carregado
  const stripeFrame = page.frameLocator('iframe[name*="stripe"]').first()

  await stripeFrame.locator('[placeholder="1234 1234 1234 1234"]').fill(card.number)
  await stripeFrame.locator('[placeholder="MM / YY"]').fill(card.expiry)
  await stripeFrame.locator('[placeholder="CVC"]').fill(card.cvc)

  const zipLocator = stripeFrame.locator('[placeholder="ZIP"]')
  if (await zipLocator.isVisible()) {
    await zipLocator.fill(card.zip)
  }
}

/**
 * Aguarda o redirecionamento pós-pagamento e verifica que voltou para a URL de sucesso.
 */
export async function waitForPaymentSuccess(page: Page): Promise<void> {
  await page.waitForURL(/success=true/, { timeout: 30_000 })
}
