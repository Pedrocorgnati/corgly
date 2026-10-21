/**
 * Testes de integracao contra MySQL real: idempotencia e concorrencia do
 * webhook de ebooks (item 005, D-B6, D-B9, D-B12).
 *
 * O nucleo `handleEbookWebhookRequest` roda com o ledger real (unique em
 * `eventId`), a verificacao de assinatura real do SDK (local, sem rede) e as
 * ports reais do fulfillment (item 006) via `createEbookFulfillmentPorts`, que
 * gravam pedido, token e eventos de entrega de verdade. Fakes de rede: o
 * `paymentIntents.retrieve` do webhook, o `checkout.sessions.retrieve` do
 * fulfillment (sessao paga da fixture), o `checkPdf` e o sender de email, que
 * conta POST por `idempotencyKey`.
 *
 * Cenarios:
 *   a. Mesmo evento entregue 3 vezes em sequencia: um pedido, um email.
 *   b. 5 entregas paralelas do mesmo evento: um claim, as demais in_progress.
 *   c. Eventos fora de ordem da mesma sessao: um pedido, dois eventos PROCESSED.
 *   d. Reembolso antes do pedido: 500 e FAILED; depois do pedido a reentrega
 *      reclama a linha FAILED, revoga o token e notifica uma vez.
 *
 * Segredo, chaves e emails sao placeholders, nunca valores reais.
 */

import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import Stripe from 'stripe'
import { handleEbookWebhookRequest } from '@/lib/ebooks/webhook'
import type { EbookWebhookDeps, EbookWebhookResult } from '@/lib/ebooks/webhook'
import { createEbookFulfillmentPorts } from '@/lib/ebooks/fulfillment-ports'
import type { EbookFulfillmentDeps } from '@/lib/ebooks/fulfillment'
import { generateEbookAccessToken } from '@/lib/ebooks/access-token'
import { ebookCatalogEntrySchema } from '@/lib/ebooks/schema'
import type { EbookEmailMessage } from '@/services/ebook-email.service'
import { regressionEbookInput } from '@/__tests__/fixtures/ebooks/regression-ebook'
import { testPrisma, cleanDatabase } from '../setup'
import { prisma } from '@/lib/prisma'

const TEST_SECRET = 'whsec_test_placeholder'
const PRICE_ID = 'price_test_regression'
const BUYER = 'comprador@example.test'
const realStripe = new Stripe('sk_test_placeholder')
const entry = ebookCatalogEntrySchema.parse(regressionEbookInput)

const pending: Array<() => Promise<void>> = []
// POSTs do sender fake por idempotencyKey (o Resend deduplica pela chave).
const posts = new Map<string, number>()

async function drain(): Promise<void> {
  while (pending.length > 0) {
    const task = pending.shift()
    if (task) await task()
  }
}

function distinctPosts(prefix: string): number {
  return [...posts.keys()].filter((key) => key.startsWith(prefix)).length
}

function totalPosts(): number {
  return [...posts.values()].reduce((sum, n) => sum + n, 0)
}

const emails = {
  get fulfilled() {
    return distinctPosts('ebook-delivery:')
  },
  get refund() {
    return distinctPosts('ebook-refund:')
  },
}

// Sessao paga da fixture; o payment intent segue `pi_{sessionId}` para o
// reembolso do cenario d achar o pedido.
function paidSession(sessionId: string): Stripe.Checkout.Session {
  return {
    id: sessionId,
    object: 'checkout.session',
    created: Math.floor(Date.now() / 1000),
    metadata: { kind: 'ebook', ebook_slug: entry.slug },
    payment_status: 'paid',
    amount_total: entry.unitAmount,
    currency: entry.currency,
    customer_details: { email: BUYER, address: { country: 'br' } },
    customer_email: null,
    line_items: { data: [{ quantity: 1, price: { id: PRICE_ID } }] },
    payment_intent: { id: `pi_${sessionId}`, latest_charge: null },
  } as unknown as Stripe.Checkout.Session
}

let messageSeq = 0

const fulfillmentDeps: EbookFulfillmentDeps = {
  prisma,
  stripe: {
    checkout: {
      sessions: { retrieve: vi.fn(async (id: string) => paidSession(id)) },
    },
  } as unknown as EbookFulfillmentDeps['stripe'],
  catalog: { getBySlug: (slug) => (slug === entry.slug ? entry : undefined) },
  priceIdFor: () => PRICE_ID,
  email: {
    async send(message: EbookEmailMessage) {
      posts.set(message.idempotencyKey, (posts.get(message.idempotencyKey) ?? 0) + 1)
      messageSeq += 1
      return { id: `re_msg_${messageSeq}` }
    },
    async getState() {
      return 'pending'
    },
  },
  config: {
    resendApiKey: 're_test_placeholder',
    emailFrom: 'Corgly <ebooks@example.test>',
    appUrl: 'https://app.example.test',
  },
  checkPdf: async () => undefined,
  now: () => new Date(),
  sleep: async () => undefined,
  randomUUID: () => randomUUID(),
  generateToken: generateEbookAccessToken,
}

// So `webhooks` vem do SDK real; `retrieve` e fake para nao tocar a rede. O cast
// cobre a diferenca de tipo entre o fake e o client completo.
const stripeDeps = {
  webhooks: realStripe.webhooks,
  paymentIntents: {
    retrieve: vi.fn(async (id: string) => ({ id, metadata: { kind: 'ebook' } })),
  },
} as unknown as EbookWebhookDeps['stripe']

const deps: EbookWebhookDeps = {
  prisma,
  stripe: stripeDeps,
  secret: TEST_SECRET,
  ports: createEbookFulfillmentPorts(fulfillmentDeps),
  schedule: (task) => {
    pending.push(task)
  },
  now: () => new Date(),
  config: { revokeOnRefund: true, revokeOnDispute: true },
}

function baseEvent(id: string, type: string, object: Record<string, unknown>) {
  return {
    id,
    object: 'event',
    type,
    api_version: '2025-01-27.acacia',
    created: 1_760_875_200,
    livemode: false,
    data: { object },
  }
}

function sessionEvent(id: string, type: string, sessionId: string) {
  return baseEvent(id, type, {
    id: sessionId,
    object: 'checkout.session',
    payment_status: 'paid',
    metadata: { kind: 'ebook', ebook_slug: entry.slug },
  })
}

function refundEvent(id: string, paymentIntentId: string) {
  return baseEvent(id, 'charge.refunded', {
    id: `ch_${id}`,
    object: 'charge',
    payment_intent: paymentIntentId,
    amount_refunded: entry.unitAmount,
    refunded: true,
  })
}

async function deliver(event: Record<string, unknown>): Promise<EbookWebhookResult> {
  const payload = JSON.stringify(event)
  const signature = realStripe.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET })
  return handleEbookWebhookRequest(
    {
      rawBody: Buffer.from(payload),
      signature,
      contentLength: String(Buffer.byteLength(payload)),
    },
    deps,
  )
}

const ACCEPTED = { status: 200, body: { received: true, status: 'accepted' } }
const DUPLICATE = { status: 200, body: { received: true, status: 'duplicate' } }
const IN_PROGRESS = { status: 503, body: { status: 'in_progress' } }

function ledgerOf(eventId: string) {
  return testPrisma.ebookWebhookEvent.findMany({ where: { eventId } })
}

describe('webhook de ebooks: idempotencia e concorrencia (MySQL real)', () => {
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
    pending.length = 0
    posts.clear()
    await cleanDatabase()
  })

  afterAll(async () => {
    await cleanDatabase()
  })

  it('a. mesmo evento entregue 3 vezes gera um pedido e um email', async () => {
    const event = sessionEvent('evt_seq_a', 'checkout.session.completed', 'cs_seq_a')

    const first = await deliver(event)
    await drain()
    const second = await deliver(event)
    await drain()
    const third = await deliver(event)
    await drain()

    expect(first).toEqual(ACCEPTED)
    expect(second).toEqual(DUPLICATE)
    expect(third).toEqual(DUPLICATE)
    expect(await testPrisma.ebookOrder.count()).toBe(1)
    expect(await testPrisma.ebookAccessToken.count()).toBe(1)
    expect(emails.fulfilled).toBe(1)
    expect(totalPosts()).toBe(1)
    expect((await testPrisma.ebookOrder.findFirst())?.deliveryStatus).toBe('ACCEPTED')
    const ledger = await ledgerOf('evt_seq_a')
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.status).toBe('PROCESSED')
  })

  it('b. 5 entregas paralelas do mesmo evento tem um unico claim', async () => {
    const event = sessionEvent('evt_par_b', 'checkout.session.completed', 'cs_par_b')

    const results = await Promise.all(Array.from({ length: 5 }, () => deliver(event)))
    await drain()

    const accepted = results.filter((r) => r.status === 200 && r.body.status === 'accepted')
    const others = results.filter((r) => !(r.status === 200 && r.body.status === 'accepted'))
    expect(accepted).toHaveLength(1)
    expect(others).toHaveLength(4)
    for (const result of others) {
      expect([DUPLICATE, IN_PROGRESS]).toContainEqual(result)
    }
    expect(await testPrisma.ebookOrder.count()).toBe(1)
    expect(await testPrisma.ebookAccessToken.count()).toBe(1)
    expect(emails.fulfilled).toBe(1)
    expect(totalPosts()).toBe(1)
    const ledger = await ledgerOf('evt_par_b')
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.status).toBe('PROCESSED')
  })

  it('c. eventos fora de ordem da mesma sessao entregam uma vez', async () => {
    const asyncFirst = sessionEvent(
      'evt_ord_c_async',
      'checkout.session.async_payment_succeeded',
      'cs_ord_c',
    )
    const completedLater = sessionEvent('evt_ord_c_done', 'checkout.session.completed', 'cs_ord_c')

    expect(await deliver(asyncFirst)).toEqual(ACCEPTED)
    await drain()
    expect(await deliver(completedLater)).toEqual(ACCEPTED)
    await drain()

    expect(await testPrisma.ebookOrder.count()).toBe(1)
    expect(await testPrisma.ebookAccessToken.count()).toBe(1)
    expect(emails.fulfilled).toBe(1)
    expect(totalPosts()).toBe(1)
    const rows = await testPrisma.ebookWebhookEvent.findMany({
      where: { checkoutSessionId: 'cs_ord_c' },
    })
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.status === 'PROCESSED')).toBe(true)
  })

  it('d. reembolso antes do pedido falha e a reentrega revoga o token', async () => {
    const sessionId = 'cs_ref_d'
    const refund = refundEvent('evt_ref_d', `pi_${sessionId}`)

    const early = await deliver(refund)
    expect(early).toEqual({ status: 500, body: { error: 'processing_failed' } })
    expect((await ledgerOf('evt_ref_d'))[0]?.status).toBe('FAILED')

    expect(await deliver(sessionEvent('evt_ref_d_done', 'checkout.session.completed', sessionId)))
      .toEqual(ACCEPTED)
    await drain()
    expect(emails.fulfilled).toBe(1)

    const retry = await deliver(refund)
    expect(retry).toEqual(ACCEPTED)
    await drain()

    const ledger = await ledgerOf('evt_ref_d')
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.status).toBe('PROCESSED')
    const order = await testPrisma.ebookOrder.findUnique({ where: { checkoutSessionId: sessionId } })
    expect(order?.paymentStatus).toBe('REFUNDED')
    const tokens = await testPrisma.ebookAccessToken.findMany({ where: { orderId: order?.id ?? '' } })
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.revokedAt).not.toBeNull()
    expect(emails.refund).toBe(1)
    expect(totalPosts()).toBe(2)
  })
})
