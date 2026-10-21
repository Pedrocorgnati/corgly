import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { regressionEntry } from '../components/ebooks/_entry';

const mocks = vi.hoisted(() => ({
  getEbookBySlug: vi.fn(),
  fulfill: vi.fn(),
  reconcile: vi.fn(),
  buildDeps: vi.fn(() => ({ deps: true })),
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: mocks.warn, info: vi.fn(), debug: vi.fn() },
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/ebooks', () => ({
  getEbookBySlug: mocks.getEbookBySlug,
  fulfillEbookCheckoutSession: mocks.fulfill,
  reconcileEbookDeliveryOnSuccessPage: mocks.reconcile,
  buildDefaultEbookFulfillmentDeps: mocks.buildDeps,
}));

import EbookSuccessPage, { generateMetadata } from '@/app/(public)/ebooks/[slug]/sucesso/page';
import { EbookFulfillmentError } from '@/lib/ebooks/errors';

const slug = regressionEntry.slug;
const validSession = 'cs_test_a1B2c3D4e5';

async function renderSuccess(searchParams: Record<string, string | string[]>, s = slug) {
  const ui = await EbookSuccessPage({
    params: Promise.resolve({ slug: s }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(<>{ui}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEbookBySlug.mockImplementation((s: string) => (s === slug ? regressionEntry : undefined));
  mocks.reconcile.mockImplementation(async (result: unknown) => result);
});

describe('pagina de sucesso', () => {
  it.each([
    ['pending_payment', 'pending'],
    ['in_progress', 'pending'],
    ['accepted', 'pending'],
    ['delivered', 'delivered'],
    ['failed_payment', 'failedPayment'],
    ['revoked', 'revoked'],
    ['needs_review', 'needsReview'],
    ['not_ebook', 'needsReview'],
  ])('status %s vira estado %s', async (status, state) => {
    mocks.fulfill.mockResolvedValue({ status });
    await renderSuccess({ session_id: validSession });
    expect(screen.getByTestId('page-ebooks-success').getAttribute('data-state')).toBe(state);
    expect(mocks.fulfill).toHaveBeenCalledWith(
      { checkoutSessionId: validSession, trigger: 'success_page' },
      { deps: true },
    );
  });

  it('aceito pelo Resend e confirmado no reconcile vira entregue', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'accepted', orderId: 'ord_1' });
    mocks.reconcile.mockResolvedValue({ status: 'delivered', orderId: 'ord_1' });
    await renderSuccess({ session_id: validSession });
    expect(screen.getByTestId('page-ebooks-success').getAttribute('data-state')).toBe('delivered');
    expect(mocks.reconcile).toHaveBeenCalledWith({ status: 'accepted', orderId: 'ord_1' }, { deps: true });
  });

  it('pendente oferece nova consulta com o session_id', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'in_progress' });
    await renderSuccess({ session_id: validSession });
    expect(screen.getByTestId('ebooks-success-retry').getAttribute('href')).toBe(
      `/ebooks/${slug}/sucesso?session_id=${validSession}`,
    );
  });

  it('entregue mostra recuperacao e contato', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'delivered' });
    await renderSuccess({ session_id: validSession });
    expect(screen.getByTestId('ebooks-success-recovery')).toBeTruthy();
    expect(screen.getByTestId('ebooks-success-contact')).toBeTruthy();
  });

  it('pagamento falho volta para a venda', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'failed_payment' });
    await renderSuccess({ session_id: validSession });
    expect(screen.getByTestId('ebooks-success-back-to-sale').getAttribute('href')).toBe(`/ebooks/${slug}`);
  });

  it.each([
    ['sem session_id', {}],
    ['formato invalido', { session_id: 'foo' }],
    ['prefixo errado', { session_id: 'xs_test_abc' }],
    ['array', { session_id: [validSession, validSession] }],
  ])('%s vira missingSession sem chamar o fulfillment', async (_label, params) => {
    const { container } = await renderSuccess(params as Record<string, string | string[]>);
    expect(screen.getByTestId('page-ebooks-success').getAttribute('data-state')).toBe('missingSession');
    expect(mocks.fulfill).not.toHaveBeenCalled();
    expect(screen.getByTestId('ebooks-success-back-to-sale')).toBeTruthy();
    expect(container.textContent).not.toContain(validSession);
  });

  it.each([
    ['excecao desconhecida', new Error('boom'), 'pending'],
    [
      'erro transitorio',
      new EbookFulfillmentError('EBOOK_FULFILLMENT_STRIPE_UNAVAILABLE', 'stripe fora', { transient: true }),
      'pending',
    ],
    [
      'erro permanente',
      new EbookFulfillmentError('EBOOK_FULFILLMENT_AMOUNT_MISMATCH', 'valor divergente', { transient: false }),
      'needsReview',
    ],
    [
      'sessao inexistente no Stripe',
      new EbookFulfillmentError('EBOOK_FULFILLMENT_SESSION_NOT_FOUND', 'sessao inexistente', { transient: false }),
      'missingSession',
    ],
  ])('fulfillment que lanca %s vira %s', async (_label, error, state) => {
    mocks.fulfill.mockRejectedValue(error);
    await renderSuccess({ session_id: validSession });
    expect(screen.getByTestId('page-ebooks-success').getAttribute('data-state')).toBe(state);
  });

  it('reconcile que lanca mantem o status do fulfillment', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'accepted', orderId: 'ord_1' });
    mocks.reconcile.mockRejectedValue(
      new EbookFulfillmentError('EBOOK_FULFILLMENT_ORDER_NOT_FOUND', 'pedido sumiu', { transient: false }),
    );
    await renderSuccess({ session_id: validSession });
    expect(screen.getByTestId('page-ebooks-success').getAttribute('data-state')).toBe('pending');
  });

  it('o log da excecao mascara o session_id', async () => {
    mocks.fulfill.mockRejectedValue(new Error('boom'));
    await renderSuccess({ session_id: validSession });

    expect(mocks.warn).toHaveBeenCalledTimes(1);
    const [, context] = mocks.warn.mock.calls[0];
    expect(context.checkoutSessionId).toBe(`${validSession.slice(0, 10)}***${validSession.slice(-4)}`);
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(validSession);
  });

  it('nao ecoa o session_id no texto da pagina', async () => {
    mocks.fulfill.mockResolvedValue({ status: 'delivered' });
    const { container } = await renderSuccess({ session_id: validSession });
    expect(container.textContent).not.toContain(validSession);
  });

  it('nao exibe token, email nem id do pedido no HTML', async () => {
    mocks.fulfill.mockResolvedValue({
      status: 'delivered',
      orderId: 'ord_fixture_0001',
      email: 'comprador@example.com',
      accessToken: 'tok_fixture_secret_0001',
    });
    const { container } = await renderSuccess({ session_id: validSession });
    const html = container.innerHTML;
    expect(html).not.toContain('ord_fixture_0001');
    expect(html).not.toContain('comprador@example.com');
    expect(html).not.toContain('tok_fixture_secret_0001');
    expect(html).not.toMatch(/\/ebooks\/acesso\//);
  });

  it.each([['acesso'], ['inexistente']])('slug "%s" vira not found', async (s) => {
    await expect(renderSuccess({ session_id: validSession }, s)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });
});

describe('generateMetadata da pagina de sucesso', () => {
  it('fica fora do indice', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(metadata.title).toBe('success.metaTitle');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('slug inexistente tambem fica fora do indice', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'inexistente' }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
