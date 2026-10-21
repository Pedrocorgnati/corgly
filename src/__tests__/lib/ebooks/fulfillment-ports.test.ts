// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EbookConfigError, EbookFulfillmentError } from '@/lib/ebooks/errors';
import type { EbookFulfillmentDeps } from '@/lib/ebooks/fulfillment';
import {
  buildDefaultEbookFulfillmentDeps,
  createEbookFulfillmentPorts,
} from '@/lib/ebooks/fulfillment-ports';
import { getEbookWebhookPorts, pendingEbookWebhookPorts } from '@/lib/ebooks/webhook-ports';
import { regressionEbookInput } from '../../fixtures/ebooks/regression-ebook';
import { ebookCatalogEntrySchema } from '@/lib/ebooks/schema';

// Adaptador das ports (A10) e default real de `getEbookWebhookPorts()` (A11).
// Nucleo e notificacoes mockados: aqui so interessa o mapeamento port ->
// funcao, a propagacao de erro e a montagem das deps sem efeito colateral.

const mocks = vi.hoisted(() => ({
  fulfill: vi.fn(),
  notifyFailed: vi.fn(),
  notifyRefund: vi.fn(),
  recordDispute: vi.fn(),
  getStripe: vi.fn(),
  resolvePrivateDir: vi.fn(),
  checkPdf: vi.fn(),
}));

vi.mock('@/lib/ebooks/fulfillment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ebooks/fulfillment')>();
  return { ...actual, fulfillEbookCheckoutSession: mocks.fulfill };
});

vi.mock('@/lib/ebooks/fulfillment-notify', () => ({
  notifyEbookAsyncPaymentFailed: mocks.notifyFailed,
  notifyEbookRefund: mocks.notifyRefund,
  recordEbookDispute: mocks.recordDispute,
}));

vi.mock('@/lib/prisma', () => ({ prisma: { marker: 'prisma-fake' } }));

vi.mock('@/lib/stripe', () => ({ getStripe: mocks.getStripe }));

vi.mock('@/lib/ebooks/private-dir', () => ({ resolveEbooksPrivateDir: mocks.resolvePrivateDir }));

vi.mock('@/lib/ebooks/pdf-check', () => ({ checkEbookPdf: mocks.checkPdf }));

// No vitest nao ha loader de imagem do Next: o import estatico de webp vira
// string de URL, entao o mock traz um StaticImageData para o catalogo real.
vi.mock('../../../../content/ebooks/brazilian-portuguese-for-english-speakers/sales/cover.webp', () => ({
  default: { src: '/_next/static/media/cover.bp-en.webp', width: 800, height: 1200 },
}));

const entry = ebookCatalogEntrySchema.parse(regressionEbookInput);
const fakeDeps = { marker: 'deps-fake' } as unknown as EbookFulfillmentDeps;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createEbookFulfillmentPorts', () => {
  it('fulfillCheckoutSession chama o nucleo com trigger webhook e devolve void', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'delivered', orderId: 'ord_1' });
    const ports = createEbookFulfillmentPorts(fakeDeps);

    const result = await ports.fulfillCheckoutSession({
      checkoutSessionId: 'cs_test_1',
      eventId: 'evt_1',
      eventType: 'checkout.session.completed',
    });

    expect(result).toBeUndefined();
    expect(mocks.fulfill).toHaveBeenCalledTimes(1);
    expect(mocks.fulfill).toHaveBeenCalledWith(
      { checkoutSessionId: 'cs_test_1', trigger: 'webhook' },
      fakeDeps,
    );
  });

  it('needs_review nao lanca (o estado ja ficou persistido no pedido)', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'needs_review', orderId: 'ord_1' });
    const ports = createEbookFulfillmentPorts(fakeDeps);

    await expect(
      ports.fulfillCheckoutSession({
        checkoutSessionId: 'cs_test_1',
        eventId: 'evt_1',
        eventType: 'checkout.session.completed',
      }),
    ).resolves.toBeUndefined();
  });

  it('erro transiente do nucleo e relancado sem alteracao', async () => {
    const err = new EbookFulfillmentError('EBOOK_FULFILLMENT_EMAIL_UNAVAILABLE', 'indisponivel', {
      transient: true,
    });
    mocks.fulfill.mockRejectedValue(err);
    const ports = createEbookFulfillmentPorts(fakeDeps);

    await expect(
      ports.fulfillCheckoutSession({
        checkoutSessionId: 'cs_test_1',
        eventId: 'evt_1',
        eventType: 'checkout.session.async_payment_succeeded',
      }),
    ).rejects.toBe(err);
  });

  it('notifyAsyncPaymentFailed, notifyRefund e notifyDispute mapeiam para a funcao certa', async () => {
    mocks.notifyFailed.mockResolvedValue({ status: 'sent' });
    mocks.notifyRefund.mockResolvedValue({ status: 'sent' });
    mocks.recordDispute.mockResolvedValue({ status: 'sent' });
    const ports = createEbookFulfillmentPorts(fakeDeps);

    await expect(
      ports.notifyAsyncPaymentFailed({ checkoutSessionId: 'cs_test_2', eventId: 'evt_2' }),
    ).resolves.toBeUndefined();
    await expect(
      ports.notifyRefund({ orderId: 'ord_3', eventId: 'evt_3', full: false }),
    ).resolves.toBeUndefined();
    await expect(ports.notifyDispute({ orderId: 'ord_4', eventId: 'evt_4' })).resolves.toBeUndefined();

    expect(mocks.notifyFailed).toHaveBeenCalledWith(
      { checkoutSessionId: 'cs_test_2', eventId: 'evt_2' },
      fakeDeps,
    );
    expect(mocks.notifyRefund).toHaveBeenCalledWith(
      { orderId: 'ord_3', eventId: 'evt_3', full: false },
      fakeDeps,
    );
    expect(mocks.recordDispute).toHaveBeenCalledWith({ orderId: 'ord_4', eventId: 'evt_4' }, fakeDeps);
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it('erros das notificacoes sao relancados sem alteracao', async () => {
    const err = new EbookFulfillmentError('EBOOK_FULFILLMENT_EMAIL_REJECTED', 'recusado', {
      transient: false,
    });
    mocks.notifyRefund.mockRejectedValue(err);
    const ports = createEbookFulfillmentPorts(fakeDeps);

    await expect(ports.notifyRefund({ orderId: 'ord_3', eventId: 'evt_3', full: true })).rejects.toBe(err);
  });
});

describe('buildDefaultEbookFulfillmentDeps', () => {
  const saved = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('nunca lanca com envio sem configuracao e nao instancia o Stripe na montagem', () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const deps = buildDefaultEbookFulfillmentDeps();

    expect(deps.config.resendApiKey).toBe('');
    expect(deps.config.emailFrom).toBe('');
    expect(typeof deps.config.appUrl).toBe('string');
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it('retrieve delega ao getStripe() so no uso', async () => {
    const retrieve = vi.fn().mockResolvedValue({ id: 'cs_test_9' });
    mocks.getStripe.mockReturnValue({ checkout: { sessions: { retrieve } } });
    const deps = buildDefaultEbookFulfillmentDeps();

    await deps.stripe.checkout.sessions.retrieve('cs_test_9', { expand: ['line_items'] });

    expect(mocks.getStripe).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith('cs_test_9', { expand: ['line_items'] });
  });

  it('checkPdf mapeia EbookConfigError do diretorio privado para CONFIG_MISSING transiente', async () => {
    mocks.resolvePrivateDir.mockImplementation(() => {
      throw new EbookConfigError('EBOOK_PRIVATE_DIR_MISSING', 'ausente');
    });
    const deps = buildDefaultEbookFulfillmentDeps();

    const caught = await deps.checkPdf(entry).catch((err: unknown) => err);

    expect(caught).toBeInstanceOf(EbookFulfillmentError);
    expect((caught as EbookFulfillmentError).code).toBe('EBOOK_FULFILLMENT_CONFIG_MISSING');
    expect((caught as EbookFulfillmentError).transient).toBe(true);
    expect(mocks.checkPdf).not.toHaveBeenCalled();
  });

  it('checkPdf repassa o diretorio resolvido ao checkEbookPdf', async () => {
    mocks.resolvePrivateDir.mockReturnValue('/srv/privado');
    mocks.checkPdf.mockResolvedValue({ bytes: 10 });
    const deps = buildDefaultEbookFulfillmentDeps();

    await expect(deps.checkPdf(entry)).resolves.toBeUndefined();
    expect(mocks.checkPdf).toHaveBeenCalledWith(entry, '/srv/privado');
  });

  it('generateToken produz token base64url de 43 caracteres', () => {
    const deps = buildDefaultEbookFulfillmentDeps();
    expect(deps.generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('getEbookWebhookPorts', () => {
  it('devolve as ports reais, nao o default pendente', () => {
    const ports = getEbookWebhookPorts();
    expect(ports).not.toBe(pendingEbookWebhookPorts);
    expect(typeof ports.fulfillCheckoutSession).toBe('function');
  });

  it('memoriza a instancia entre chamadas', () => {
    expect(getEbookWebhookPorts()).toBe(getEbookWebhookPorts());
  });

  it('a port real chega ao nucleo do fulfillment', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'already_delivered', orderId: 'ord_1' });
    await getEbookWebhookPorts().fulfillCheckoutSession({
      checkoutSessionId: 'cs_test_5',
      eventId: 'evt_5',
      eventType: 'checkout.session.completed',
    });
    expect(mocks.fulfill).toHaveBeenCalledWith(
      { checkoutSessionId: 'cs_test_5', trigger: 'webhook' },
      expect.objectContaining({ prisma: { marker: 'prisma-fake' } }),
    );
  });

  it('montagem que lanca nao memoriza nada; a chamada seguinte tenta de novo', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock('@/lib/ebooks/fulfillment-ports', () => ({
      buildDefaultEbookFulfillmentDeps: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('falha na montagem');
        return fakeDeps;
      },
      createEbookFulfillmentPorts: () => ({ marker: 'ports-reais' }),
    }));
    const fresh = await import('@/lib/ebooks/webhook-ports');

    expect(() => fresh.getEbookWebhookPorts()).toThrow('falha na montagem');
    const second = fresh.getEbookWebhookPorts();
    expect(second).toEqual({ marker: 'ports-reais' });
    expect(fresh.getEbookWebhookPorts()).toBe(second);
    expect(attempts).toBe(2);

    vi.doUnmock('@/lib/ebooks/fulfillment-ports');
    vi.resetModules();
  });
});
