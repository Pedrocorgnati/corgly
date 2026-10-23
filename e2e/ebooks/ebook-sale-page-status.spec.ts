import { test, expect } from '@playwright/test'

// Status HTTP da pagina de venda /ebooks/{slug}.
// Elegivel = slug no catalogo do build (200). Inelegivel = slug fora dele
// (404 real, nunca 200 com a UI de not-found).
// Roda contra o servidor local ou contra producao via PLAYWRIGHT_BASE_URL.
const ELIGIBLE_SLUGS = [
  'portugues-brasileno-para-hispanohablantes',
  'portoghese-brasiliano-per-italofoni',
]

const INELIGIBLE_SLUGS = [
  // Ebook com pasta em content/ mas fora do registro do catalogo
  'brazilian-portuguese-for-english-speakers',
  'slug-inexistente-404',
]

test.describe('GET /ebooks/{slug}', () => {
  for (const slug of ELIGIBLE_SLUGS) {
    test(`elegivel ${slug} responde 200`, async ({ request }) => {
      const response = await request.get('/ebooks/' + slug)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('text/html')
    })
  }

  for (const slug of INELIGIBLE_SLUGS) {
    test(`inelegivel ${slug} responde 404`, async ({ request }) => {
      const response = await request.get('/ebooks/' + slug)
      expect(response.status()).toBe(404)
    })
  }
})
