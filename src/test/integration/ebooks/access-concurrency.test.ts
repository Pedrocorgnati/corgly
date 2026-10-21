/**
 * Testes de integracao contra MySQL real: concorrencia do contador de downloads
 * do acesso a ebooks (D3, ST011).
 *
 * A funcao `recordEbookDownload` roda com a transacao interativa real (updateMany
 * condicional do token, log de acesso e primeiro download do pedido). Nao ha
 * retry, fake de banco nem mascarar de erro: se o MySQL abortar alguma transacao
 * por deadlock/write conflict (Prisma P2034) o teste falha, e esse e o criterio.
 *
 * Cenarios:
 *   a. 5 chamadas concorrentes com limite 1: uma grava, quatro rejeitadas;
 *      contador 1, um log e firstDownloadAt preenchido.
 *   b. Sem limite, duas chamadas sequenciais com `now` distintas: contador 2,
 *      dois logs e firstDownloadAt igual ao primeiro `now`.
 *   c. Token revogado: nada e gravado, contador 0, sem log e sem firstDownloadAt.
 *   d. IP de 45 chars (limite da coluna): gravado igual no log de acesso.
 *
 * Pedidos, tokens e IPs sao placeholders; o ebook vem apenas da fixture de
 * regressao. Nenhum valor real de segredo, slug ou titulo de ebook aparece.
 */

import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import { recordEbookDownload } from '@/lib/ebooks/access'
import { generateEbookAccessToken, hashEbookAccessToken } from '@/lib/ebooks/access-token'
import { regressionEbookInput } from '@/__tests__/fixtures/ebooks/regression-ebook'
import { testPrisma, cleanDatabase } from '../setup'
import { prisma } from '@/lib/prisma'

const BUYER = 'comprador@example.test'
// Limite da coluna `ip` (VarChar 45); sintetico, nunca um IP real.
const LONG_IP = 'a'.repeat(45)

type RecordDownloadDeps = Parameters<typeof recordEbookDownload>[0]

function recordDeps(now: () => Date, downloadLimit: () => number | null): RecordDownloadDeps {
  return { prisma, now, downloadLimit }
}

interface PaidOrderWithToken {
  orderId: string
  tokenId: string
}

/** Pedido pago da fixture com um token de acesso; `revoked` nasce revogado. */
async function createPaidOrderWithToken(options: { revoked?: boolean } = {}): Promise<PaidOrderWithToken> {
  const tokenHash = hashEbookAccessToken(generateEbookAccessToken())
  const order = await testPrisma.ebookOrder.create({
    data: {
      checkoutSessionId: `cs_access_${randomUUID()}`,
      slug: regressionEbookInput.slug,
      email: BUYER,
      locale: regressionEbookInput.locale,
      amountTotal: regressionEbookInput.unitAmount,
      currency: regressionEbookInput.currency,
      paymentStatus: 'PAID',
      purchasedAt: new Date(),
    },
  })
  const token = await testPrisma.ebookAccessToken.create({
    data: {
      orderId: order.id,
      tokenHash,
      ...(options.revoked ? { revokedAt: new Date() } : {}),
    },
  })
  return { orderId: order.id, tokenId: token.id }
}

function orderOf(orderId: string) {
  return testPrisma.ebookOrder.findUniqueOrThrow({ where: { id: orderId } })
}

function tokenOf(tokenId: string) {
  return testPrisma.ebookAccessToken.findUniqueOrThrow({ where: { id: tokenId } })
}

function logCountOf(tokenId: string) {
  return testPrisma.ebookAccessLog.count({ where: { tokenId } })
}

describe('acesso a ebooks: concorrencia do contador de downloads (MySQL real)', () => {
  beforeAll(async () => {
    await cleanDatabase()
  })

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await cleanDatabase()
  })

  afterAll(async () => {
    await cleanDatabase()
  })

  it('a. 5 chamadas concorrentes com limite 1 gravam exatamente uma vez', async () => {
    const { orderId, tokenId } = await createPaidOrderWithToken()
    const deps = recordDeps(() => new Date(), () => 1)

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        recordEbookDownload(deps, {
          order: { id: orderId },
          token: { id: tokenId },
          ip: '203.0.113.10',
        }),
      ),
    )

    const recorded = results.filter((result) => result.recorded)
    const rejected = results.filter((result) => !result.recorded)
    expect(recorded).toHaveLength(1)
    expect(rejected).toHaveLength(4)
    for (const result of rejected) {
      expect(result).toEqual({ recorded: false, reason: 'limit_or_revoked' })
    }

    expect((await tokenOf(tokenId)).downloadCount).toBe(1)
    expect(await logCountOf(tokenId)).toBe(1)
    expect((await orderOf(orderId)).firstDownloadAt).not.toBeNull()
  })

  it('b. firstDownloadAt e gravado uma unica vez, com o primeiro now', async () => {
    const { orderId, tokenId } = await createPaidOrderWithToken()
    const t1 = new Date('2025-03-05T10:00:00.000Z')
    const t2 = new Date('2025-03-05T10:07:00.000Z')
    let currentNow = t1
    const deps = recordDeps(() => currentNow, () => null)
    const input = { order: { id: orderId }, token: { id: tokenId } }

    expect(await recordEbookDownload(deps, { ...input, ip: '203.0.113.11' })).toEqual({ recorded: true })
    currentNow = t2
    expect(await recordEbookDownload(deps, { ...input, ip: '203.0.113.12' })).toEqual({ recorded: true })

    expect((await tokenOf(tokenId)).downloadCount).toBe(2)
    expect(await logCountOf(tokenId)).toBe(2)

    const firstDownloadAt = (await orderOf(orderId)).firstDownloadAt
    expect(firstDownloadAt).not.toBeNull()
    // Tolerancia de 1000 ms: o MySQL pode truncar milissegundos em DATETIME.
    expect(Math.abs((firstDownloadAt as Date).getTime() - t1.getTime())).toBeLessThan(1000)
  })

  it('c. token revogado nao grava download, log nem firstDownloadAt', async () => {
    const { orderId, tokenId } = await createPaidOrderWithToken({ revoked: true })
    const deps = recordDeps(() => new Date(), () => null)

    const result = await recordEbookDownload(deps, {
      order: { id: orderId },
      token: { id: tokenId },
      ip: '203.0.113.13',
    })

    expect(result).toEqual({ recorded: false, reason: 'limit_or_revoked' })
    expect((await tokenOf(tokenId)).downloadCount).toBe(0)
    expect(await logCountOf(tokenId)).toBe(0)
    expect((await orderOf(orderId)).firstDownloadAt).toBeNull()
  })

  it('d. ip de 45 chars e gravado igual no log de acesso', async () => {
    const { orderId, tokenId } = await createPaidOrderWithToken()
    const deps = recordDeps(() => new Date(), () => 1)
    expect(LONG_IP).toHaveLength(45)

    const result = await recordEbookDownload(deps, {
      order: { id: orderId },
      token: { id: tokenId },
      ip: LONG_IP,
    })

    expect(result).toEqual({ recorded: true })
    const logs = await testPrisma.ebookAccessLog.findMany({ where: { tokenId } })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.ip).toBe(LONG_IP)
    expect(logs[0]?.orderId).toBe(orderId)
    expect((await tokenOf(tokenId)).downloadCount).toBe(1)
    expect((await orderOf(orderId)).firstDownloadAt).not.toBeNull()
  })
})
