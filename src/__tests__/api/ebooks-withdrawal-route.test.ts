// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { regressionEbookInput } from '../fixtures/ebooks/regression-ebook';

// Confirmacao da desistencia (D8) de ponta a ponta: resolvedor e servico
// reais; so banco, Stripe, rate limit e logger sao mockados. O catalogo vem da
// fixture de regressao; nenhum ebook real entra no teste.

const mocks = vi.hoisted(() => {
  const checkRateLimit = vi.fn();
  const refundsCreate = vi.fn();
  const eventCreate = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const prisma = {
    ebookAccessToken: { findUnique: vi.fn() },
    ebookDeliveryEvent: { create: eventCreate },
    ebookOrder: { updateMany: vi.fn(), findUnique: vi.fn() },
    ebookAccessLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { checkRateLimit, refundsCreate, eventCreate, logger, prisma };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: { EBOOK_ACCESS: { maxRequests: 10, windowMs: 60_000 } },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ refunds: { create: mocks.refundsCreate } }),
}));
vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));

const APP_URL = 'https://app.example.com';
const VALID_TOKEN = 'A'.repeat(43);
const SLUG = regressionEbookInput.slug;
const LOCALE = regressionEbookInput.locale;
const COPY_INVALID = regressionEbookInput.copy.errors.accessInvalid;
const COPY_REVOKED = regressionEbookInput.copy.errors.accessRevoked;
const COPY_RATE_LIMITED = regressionEbookInput.copy.errors.accessRateLimited;
const COPY_UNAVAILABLE = regressionEbookInput.copy.errors.pdfUnavailable;

interface OrderOverrides {
  id?: string;
  slug?: string;
  locale?: string;
  paymentStatus?: string;
  stripePaymentIntentId?: string | null;
  firstDownloadAt?: Date | null;
  createdAt?: Date;
}

interface TokenOverrides {
  id?: string;
  downloadCount?: number;
  revokedAt?: Date | null;
}

/** Linha do token com o pedido elegivel por default; override por argumento. */
function tokenRow(orderOverrides: OrderOverrides = {}, tokenOverrides: TokenOverrides = {}) {
  return {
    id: 't1',
    downloadCount: 0,
    revokedAt: null,
    ...tokenOverrides,
    order: {
      id: 'o1',
      slug: SLUG,
      locale: LOCALE,
      paymentStatus: 'PAID',
      stripePaymentIntentId: 'pi_fixture',
      firstDownloadAt: null,
      createdAt: new Date(),
      ...orderOverrides,
    },
  };
}

function loggedMessages(): string[] {
  const calls = [
    ...mocks.logger.error.mock.calls,
    ...mocks.logger.warn.mock.calls,
    ...mocks.logger.info.mock.calls,
  ];
  return calls.map((call) => String(JSON.stringify(call)));
}

// Import dinamico DEPOIS do resetModules: catalogo e modulos releem os stubs.
async function loadRoute() {
  return import('@/app/ebooks/acesso/[token]/desistir/confirmar/route');
}

async function post(token: string): Promise<Response> {
  const { POST } = await loadRoute();
  const request = new NextRequest(APP_URL + '/ebooks/acesso/' + token + '/desistir/confirmar', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.7' },
  });
  return POST(request, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  vi.resetModules();
  mocks.checkRateLimit.mockReset();
  mocks.refundsCreate.mockReset();
  mocks.eventCreate.mockReset();
  mocks.logger.error.mockReset();
  mocks.logger.warn.mockReset();
  mocks.logger.info.mockReset();
  mocks.prisma.ebookAccessToken.findUnique.mockReset();
  mocks.prisma.ebookOrder.updateMany.mockReset();
  mocks.prisma.ebookOrder.findUnique.mockReset();
  mocks.prisma.ebookAccessLog.create.mockReset();
  mocks.prisma.$transaction.mockReset();
  vi.doMock('../../../content/ebooks/index', () => ({ ebookRegistry: [regressionEbookInput] }));
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  });
  mocks.eventCreate.mockResolvedValue({});
  mocks.prisma.ebookOrder.findUnique.mockResolvedValue({ firstDownloadAt: null });
  mocks.refundsCreate.mockResolvedValue({ id: 're_fixture' });
});

describe('POST /ebooks/acesso/{token}/desistir/confirmar: decisao D8', () => {
  it('elegivel: 303 status=accepted com estorno idempotente e Location relativa', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/ebooks/acesso/' + VALID_TOKEN + '/desistir?status=accepted');
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(mocks.refundsCreate).toHaveBeenCalledTimes(1);
    const [, refundOptions] = mocks.refundsCreate.mock.calls[0]!;
    expect(refundOptions).toEqual({ idempotencyKey: 'ebook-withdrawal:o1' });
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
  });

  it('download iniciado: 303 status=review sem chamar o gateway', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow({ firstDownloadAt: new Date() }));

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/ebooks/acesso/' + VALID_TOKEN + '/desistir?status=review');
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
  });

  it('janela de 14 dias vencida: 303 status=expired sem chamar o gateway', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(
      tokenRow({ createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) }),
    );

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/ebooks/acesso/' + VALID_TOKEN + '/desistir?status=expired');
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
  });

  it('gateway recusa o estorno: 303 status=error sem vazar a mensagem', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    mocks.refundsCreate.mockRejectedValue(new Error('gateway msg'));

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/ebooks/acesso/' + VALID_TOKEN + '/desistir?status=error');
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
    for (const entry of loggedMessages()) {
      expect(entry).not.toContain('gateway msg');
    }
  });

  it('banco falha ao gravar o evento apos o estorno: 303 status=error', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    mocks.eventCreate.mockRejectedValue(new Error('falha de banco'));

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/ebooks/acesso/' + VALID_TOKEN + '/desistir?status=error');
    expect(mocks.refundsCreate).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    for (const entry of loggedMessages()) {
      expect(entry).not.toContain('falha de banco');
      expect(entry).not.toContain(VALID_TOKEN);
    }
  });
});

describe('POST /ebooks/acesso/{token}/desistir/confirmar: borda HTTP', () => {
  it('429 com Retry-After quando o rate limit estoura', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).not.toBeNull();
    expect(await res.text()).toContain(COPY_RATE_LIMITED);
    expect(mocks.prisma.ebookAccessToken.findUnique).not.toHaveBeenCalled();
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it('404 para token malformado, sem consulta nem estorno', async () => {
    const res = await post('curto');

    expect(res.status).toBe(404);
    expect(await res.text()).toContain(COPY_INVALID);
    expect(mocks.prisma.ebookAccessToken.findUnique).not.toHaveBeenCalled();
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it('404 para token inexistente, sem estorno', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(null);

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(await res.text()).toContain(COPY_INVALID);
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it('410 para token revogado, sem estorno', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow({}, { revokedAt: new Date() }));

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(410);
    expect(await res.text()).toContain(COPY_REVOKED);
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it('410 para pedido com pagamento estornado, sem estorno', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow({ paymentStatus: 'REFUNDED' }));

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(410);
    expect(await res.text()).toContain(COPY_REVOKED);
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it('503 com a copia do catalogo quando a consulta falha antes do ready', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockRejectedValue(new Error('banco indisponivel'));

    const res = await post(VALID_TOKEN);

    expect(res.status).toBe(503);
    expect(await res.text()).toContain(COPY_UNAVAILABLE);
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    for (const entry of loggedMessages()) {
      expect(entry).not.toContain(VALID_TOKEN);
    }
  });

  it.each(['GET', 'PUT', 'PATCH', 'DELETE'] as const)('405 com Allow: POST para %s', async (method) => {
    const route = await loadRoute();

    const res = route[method]();

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('Method not allowed.');
  });
});
