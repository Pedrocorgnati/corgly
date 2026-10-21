import type { Page } from '@playwright/test'
import { STRIPE_CARDS } from './stripe'

/**
 * Helpers de e2e para o fluxo de compra e acesso de ebooks.
 *
 * Os seletores abaixo sao os do Stripe Checkout HOSPEDADO (pagina top-level
 * checkout.stripe.com, campos fora de iframe), conferidos no run do item 010.
 * Este helper nao conhece nenhum ebook alem da fixture e2e.
 */

/** Slug do ebook usado apenas nos testes e2e */
export const E2E_EBOOK_SLUG = 'e2e-fixture-ebook'

/** Email do comprador usado apenas nos testes e2e */
export const E2E_EBOOK_BUYER_EMAIL = 'delivered@resend.dev'

/**
 * Preenche e submete o Stripe Checkout hospedado (nao usa iframe).
 * Recebe apenas os dados do cartao de teste como dado de entrada.
 */
export async function fillHostedCheckout(
  page: Page,
  opts: { email: string; card?: typeof STRIPE_CARDS.success; name?: string },
): Promise<void> {
  const card = opts.card ?? STRIPE_CARDS.success

  // 1. aguarda a pagina hospedada do Checkout
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })

  // 2. email do comprador
  await page.locator('#email').fill(opts.email)

  // 3. o Checkout pode abrir com wallet/Link expandido: abre o acordeao de cartao
  const cardAccordionButton = page.locator('[data-testid="card-accordion-item-button"]')
  if (await cardAccordionButton.isVisible().catch(() => false)) {
    await cardAccordionButton.click()
  }

  // 4. dados do cartao e nome do pagador
  await page.locator('#cardNumber').fill(card.number)
  await page.locator('#cardExpiry').fill(card.expiry)
  await page.locator('#cardCvc').fill(card.cvc)
  await page.locator('#billingName').fill(opts.name ?? 'E2E Buyer')

  // 5. pais e cep so quando presentes no formulario
  const countrySelect = page.locator('#billingCountry')
  if (await countrySelect.isVisible().catch(() => false)) {
    await countrySelect.selectOption('US')
  }
  const postalCodeInput = page.locator('#billingPostalCode')
  if (await postalCodeInput.isVisible().catch(() => false)) {
    await postalCodeInput.fill(card.zip)
  }

  // 6. submete o pagamento (fallback se o botao principal nao estiver visivel)
  const submitButton = page.locator('button[type="submit"]').first()
  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click()
  } else {
    await page.locator('.SubmitButton').click()
  }
}

/**
 * Mascara um token para log: nunca imprime o valor cru.
 */
export function maskToken(value: string): string {
  return value.slice(0, 10) + '***' + value.slice(-4)
}
