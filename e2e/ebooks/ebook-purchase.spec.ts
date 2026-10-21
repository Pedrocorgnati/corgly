import { test, expect } from '@playwright/test'
import {
  E2E_EBOOK_BUYER_EMAIL,
  fillHostedCheckout,
  maskToken,
} from '../helpers/ebooks'

test.describe('Compra de ebook no Checkout hospedado (caminho feliz)', () => {
  test.skip(
    process.env.EBOOKS_E2E_FIXTURE !== '1',
    'EBOOKS_E2E_FIXTURE != 1: ambiente e2e de ebooks nao preparado',
  )

  test('catalogo -> pagina de venda -> Checkout -> sucesso com entrega', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'caminho feliz roda so em chromium (Checkout hospedado real)',
    )
    test.setTimeout(180_000)

    // a. catalogo
    await page.goto('/ebooks')
    await expect(page.getByTestId('page-ebooks-catalog')).toBeVisible()
    await expect(page.getByTestId('ebook-catalog-card-e2e-fixture-ebook')).toBeVisible()
    await page.getByTestId('ebook-catalog-card-link-e2e-fixture-ebook').click()
    await page.waitForURL(/\/ebooks\/e2e-fixture-ebook$/)

    // b. pagina de venda
    await expect(page.getByTestId('ebook-sales-page')).toBeVisible()
    const price = page.getByTestId('ebook-price-value')
    await expect(price).toBeVisible()
    await expect(price).not.toBeEmpty()
    await expect(price).toContainText('19.90')

    // c. consentimento antes de liberar a compra
    const waiver = page.getByTestId('ebook-buy-waiver')
    const buyButton = page.getByTestId('ebook-buy-button')
    await expect(waiver).not.toBeChecked()
    await expect(buyButton).toBeDisabled()
    await waiver.check()
    await expect(buyButton).toBeEnabled()
    await buyButton.click()

    // d. Checkout hospedado
    await fillHostedCheckout(page, { email: E2E_EBOOK_BUYER_EMAIL })

    // e. retorno para a pagina de sucesso com session id de teste
    const startedAt = Date.now()
    await page.waitForURL(
      /\/ebooks\/e2e-fixture-ebook\/sucesso\?session_id=cs_test_[A-Za-z0-9]+/,
      { timeout: 60_000 },
    )

    // f. aguarda a entrega
    // estados validos do app: pending, delivered, failedPayment, revoked, needsReview, missingSession
    while (Date.now() - startedAt < 30_000) {
      const state = await page.getByTestId('page-ebooks-success').getAttribute('data-state')
      if (state === 'delivered') break
      await page.waitForTimeout(2_000)
      await page.reload()
    }
    await expect(page.getByTestId('page-ebooks-success')).toHaveAttribute('data-state', 'delivered')

    // g. metrica de confirmacao
    const elapsedMs = Date.now() - startedAt
    test.info().annotations.push({ type: 'confirmation_ms', description: String(elapsedMs) })
    console.log('[ebook-e2e] confirmacao em ' + elapsedMs + ' ms')

    // h. a pagina de sucesso nao expoe link de acesso
    expect(await page.content()).not.toMatch(/\/ebooks\/acesso\//)

    // i. session id so aparece mascarada em log
    const sessionId = new URL(page.url()).searchParams.get('session_id') ?? ''
    console.log('[ebook-e2e] session mascarada: ' + maskToken(sessionId))
  })
})
