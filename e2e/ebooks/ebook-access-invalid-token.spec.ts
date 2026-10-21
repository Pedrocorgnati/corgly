import { randomBytes } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'

// Mensagem de acesso invalido espelhada aqui: o Playwright nao importa o modulo do
// catalogo do app (o modulo importa imagens .webp e o runner nao faz o parse).
// Com a fixture e2e ativa o catalogo traz so a fixture, cuja mensagem e a constante abaixo.
const ACCESS_INVALID_FIXTURE = 'This fictional test access link is invalid.'
const ACCESS_INVALID_MESSAGES = ['This access link is not valid.', ACCESS_INVALID_FIXTURE]

// Token bem formado: base64url de 32 bytes (43 chars [A-Za-z0-9_-])
function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

async function expectAccessInvalid(page: Page, token: string): Promise<void> {
  const response = await page.goto('/ebooks/acesso/' + token)

  expect(response).not.toBeNull()
  expect(response!.status()).toBe(404)
  expect(response!.status()).not.toBe(500)

  const headers = response!.headers()
  expect(headers['content-type']).toContain('text/html')
  expect(headers['cache-control']).toContain('no-store')

  const message = (await page.locator('main p').textContent())?.trim() ?? ''
  expect(ACCESS_INVALID_MESSAGES).toContain(message)
  await expect(page).toHaveTitle(message)
  expect(await page.content()).not.toContain(token)
}

test.describe('GET /ebooks/acesso/{token} com token invalido', () => {
  test('token malformado retorna 404 sem eco do token', async ({ page }) => {
    const token = 'not-a-valid-token'
    await expectAccessInvalid(page, token)
  })

  test('token bem formado inexistente retorna 404 sem eco do token', async ({ page }) => {
    const token = randomToken()
    await expectAccessInvalid(page, token)
  })

  test('HEAD espelha o status 404 sem corpo', async ({ request }) => {
    const token = randomToken()
    const head = await request.head('/ebooks/acesso/' + token)
    expect(head.status()).toBe(404)
    expect((await head.body()).length).toBe(0)
  })
})
