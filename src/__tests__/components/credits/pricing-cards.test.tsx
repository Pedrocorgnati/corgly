import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { PricingCards, type PricingCardsProps } from '@/components/student/pricing-cards';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import ptBR from '../../../../i18n/messages/pt-BR.json';

/**
 * Vitrine de TRES planos: SINGLE, PACK_10 e MONTHLY (10 ou 20 aulas/mes).
 * PACK_5 saiu da VITRINE mas continua suportado no backend — por isso o teste
 * exige a ausencia do CARD, nao a ausencia do pacote.
 *
 * Precos vem exclusivamente de `src/lib/pricing/config.ts` (unica tabela
 * multi-moeda do produto). Com locale pt-BR e preferencia persistida BRL:
 *   SINGLE     R$ 125,00      PROMO (1a aula)  R$ 62,50
 *   PACK_10    R$ 950,00      (R$ 95,00/aula)
 *   MONTHLY_10 R$ 850,00      (R$ 85,00/aula)
 *   MONTHLY_20 R$ 1.500,00    (R$ 75,00/aula)
 *
 * As mensagens sao as REAIS (`i18n/messages/pt-BR.json`): o componente estoura
 * em chave ausente, entao um dicionario improvisado esconderia regressao de i18n.
 */

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

// `apiClient` e mockado; `ApiError` continua REAL porque o componente e o hook
// de moeda decidem por `instanceof`.
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const api = vi.mocked(apiClient);
const toastMock = vi.mocked(toast);

const CHECKOUT_URL = 'https://checkout.stripe.com/test';

// jsdom nao navega: trocamos `location` por um objeto observavel para provar
// que o happy path termina em redirect (e que o sad path NAO redireciona).
const realLocation = window.location;

function stubLocation(): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: '', origin: realLocation.origin, assign: vi.fn(), replace: vi.fn() },
  });
}

afterAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

function renderCards(props: PricingCardsProps = {}) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <PricingCards {...props} />
    </NextIntlClientProvider>,
  );
}

/** Renderiza e espera a preferencia de moeda terminar de carregar. */
async function renderReady(props: PricingCardsProps = {}) {
  const utils = renderCards(props);
  await waitFor(() =>
    expect(screen.getByTestId('credits-currency-select')).toHaveAttribute('aria-busy', 'false'),
  );
  return utils;
}

const monthlyCard = () => within(screen.getByTestId('credits-package-monthly'));
const singleCard = () => within(screen.getByTestId('credits-package-single'));
const pack10Card = () => within(screen.getByTestId('credits-package-pack_10'));

describe('PricingCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubLocation();
    api.get.mockResolvedValue({
      data: { currency: 'BRL', persisted: 'BRL', supported: ['BRL', 'USD', 'EUR', 'USDC'] },
    });
    api.patch.mockResolvedValue({ data: { currency: 'USD' } });
  });

  it('renderiza os tres planos da vitrine e nao expoe PACK_5', async () => {
    await renderReady();

    expect(screen.getByTestId('credits-package-single')).toBeInTheDocument();
    expect(screen.getByTestId('credits-package-pack_10')).toBeInTheDocument();
    expect(screen.getByTestId('credits-package-monthly')).toBeInTheDocument();
    expect(screen.getByTestId('credits-packages').children).toHaveLength(3);

    expect(screen.getByText('Aula avulsa')).toBeInTheDocument();
    expect(screen.getByText('Pack 10 aulas')).toBeInTheDocument();
    expect(screen.getByText('Mensal')).toBeInTheDocument();

    expect(screen.queryByTestId('credits-package-pack_5')).not.toBeInTheDocument();
    expect(screen.queryByText(/pack 5/i)).not.toBeInTheDocument();
  });

  it('renderiza tres CTAs: duas compras e uma assinatura', async () => {
    await renderReady();

    expect(screen.getAllByRole('button', { name: 'Comprar' })).toHaveLength(2);
    expect(screen.getByTestId('credits-package-single-buy-button')).toHaveTextContent('Comprar');
    expect(screen.getByTestId('credits-package-pack_10-buy-button')).toHaveTextContent('Comprar');
    expect(screen.getByTestId('credits-package-monthly-buy-button')).toHaveTextContent(
      'Assinar mensal',
    );
  });

  it('exibe o selo "Mais escolhido" apenas no PACK_10', async () => {
    await renderReady();

    const badges = screen.getAllByTestId('credits-package-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('Mais escolhido');
    expect(screen.getByTestId('credits-package-pack_10')).toContainElement(badges[0]);
  });

  it('mostra os precos canonicos em BRL vindos da tabela unica', async () => {
    await renderReady();

    expect(singleCard().getByText('R$ 125,00')).toBeInTheDocument();
    // Sem primeira compra nao ha preco promocional na vitrine.
    expect(singleCard().queryByText('R$ 62,50')).not.toBeInTheDocument();

    expect(pack10Card().getByText('R$ 950,00')).toBeInTheDocument();
    expect(pack10Card().getByText('R$ 95,00')).toBeInTheDocument();

    // Mensal abre em 10 aulas: total, preco/aula em destaque e na opcao.
    expect(monthlyCard().getByText('R$ 850,00')).toBeInTheDocument();
    expect(monthlyCard().getAllByText('R$ 85,00')).toHaveLength(2);
    expect(monthlyCard().getByText('R$ 75,00')).toBeInTheDocument();
    expect(monthlyCard().getByText('por mês · 10 aulas inclusas')).toBeInTheDocument();
  });

  it('troca o volume mensal para 20 aulas e repreca o plano', async () => {
    await renderReady();

    expect(screen.getByTestId('credits-monthly-option-10')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('credits-monthly-option-20'));

    expect(screen.getByTestId('credits-monthly-option-20')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('credits-monthly-option-10')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(monthlyCard().getByText('R$ 1.500,00')).toBeInTheDocument();
    expect(monthlyCard().getAllByText('R$ 75,00')).toHaveLength(2);
    expect(monthlyCard().queryByText('R$ 850,00')).not.toBeInTheDocument();
    expect(monthlyCard().getByText('por mês · 20 aulas inclusas')).toBeInTheDocument();
    expect(monthlyCard().getAllByText('melhor custo por aula')).toHaveLength(2);
  });

  it('aplica o preco de primeira aula quando isFirstPurchase', async () => {
    await renderReady({ isFirstPurchase: true });

    expect(singleCard().getByText('R$ 62,50')).toBeInTheDocument();
    // Preco cheio aparece riscado e de novo como "aulas seguintes".
    expect(singleCard().getAllByText('R$ 125,00')).toHaveLength(2);
    expect(singleCard().getByText('Primeira aula')).toBeInTheDocument();
    expect(singleCard().getByText('Aulas seguintes')).toBeInTheDocument();
    expect(
      singleCard().getByText('Desconto de primeira aula aplicado automaticamente no pagamento.'),
    ).toBeInTheDocument();
  });

  it('marca o plano que veio da landing (?plan=)', async () => {
    await renderReady({ initialPlan: 'PACK_10' });

    expect(screen.getByTestId('credits-package-pack_10')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('credits-package-pack_10-selected-note')).toHaveTextContent(
      'Plano escolhido na página inicial',
    );
    expect(screen.queryByTestId('credits-package-single-selected-note')).not.toBeInTheDocument();
    expect(screen.queryByTestId('credits-package-monthly-selected-note')).not.toBeInTheDocument();
  });

  it('respeita o volume mensal que veio da landing (?lessons=20)', async () => {
    await renderReady({ initialPlan: 'MONTHLY', initialMonthlyLessons: 20 });

    expect(screen.getByTestId('credits-monthly-option-20')).toHaveAttribute('aria-checked', 'true');
    expect(monthlyCard().getByText('R$ 1.500,00')).toBeInTheDocument();
  });

  it('compra avulsa: POST no checkout com packageType e moeda, e redireciona', async () => {
    api.post.mockResolvedValueOnce({ data: { url: CHECKOUT_URL } });
    await renderReady();

    fireEvent.click(screen.getByTestId('credits-package-single-buy-button'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(API.CHECKOUT, {
      packageType: 'SINGLE',
      isSubscription: false,
      currency: 'BRL',
    });
    expect(toastMock.loading).toHaveBeenCalledWith('Redirecionando para o pagamento seguro...');
    await waitFor(() => expect(window.location.href).toBe(CHECKOUT_URL));
  });

  it('assinatura mensal: POST no eixo monthlyLessons escolhido', async () => {
    api.post.mockResolvedValueOnce({ data: { url: CHECKOUT_URL } });
    await renderReady();

    fireEvent.click(screen.getByTestId('credits-monthly-option-20'));
    fireEvent.click(screen.getByTestId('credits-package-monthly-buy-button'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(API.CHECKOUT, {
      isSubscription: true,
      monthlyLessons: 20,
      currency: 'BRL',
    });
  });

  it('sinaliza compra em andamento e bloqueia os outros CTAs', async () => {
    api.post.mockReturnValueOnce(new Promise(() => {}));
    await renderReady();

    fireEvent.click(screen.getByTestId('credits-package-pack_10-buy-button'));

    await waitFor(() =>
      expect(screen.getByTestId('credits-package-pack_10-buy-button')).toHaveTextContent(
        'Comprando...',
      ),
    );
    expect(screen.getByTestId('credits-package-single-buy-button')).toBeDisabled();
    expect(screen.getByTestId('credits-package-monthly-buy-button')).toBeDisabled();
  });

  it('assinatura em andamento usa rotulo proprio', async () => {
    api.post.mockReturnValueOnce(new Promise(() => {}));
    await renderReady();

    fireEvent.click(screen.getByTestId('credits-package-monthly-buy-button'));

    await waitFor(() =>
      expect(screen.getByTestId('credits-package-monthly-buy-button')).toHaveTextContent(
        'Assinando...',
      ),
    );
  });

  it('falha do checkout vira toast de erro com o detalhe da API e libera o CTA', async () => {
    api.post.mockRejectedValueOnce(new ApiError('Erro de teste', 400, 'CHECKOUT_FAILED'));
    await renderReady();

    fireEvent.click(screen.getByTestId('credits-package-single-buy-button'));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        'Não foi possível iniciar o pagamento. Tente novamente.',
        { description: 'Erro de teste' },
      ),
    );
    expect(toastMock.loading).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
    await waitFor(() =>
      expect(screen.getByTestId('credits-package-single-buy-button')).toBeEnabled(),
    );
    expect(screen.getByTestId('credits-package-single-buy-button')).toHaveTextContent('Comprar');
  });

  it('resposta sem url de checkout nao redireciona em silencio', async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    await renderReady();

    fireEvent.click(screen.getByTestId('credits-package-pack_10-buy-button'));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        'Não foi possível iniciar o pagamento. Tente novamente.',
        { description: 'checkout-url-ausente' },
      ),
    );
    expect(window.location.href).toBe('');
  });

  // ATENCAO: o hook de moeda guarda estado em modulo (compartilhado na pagina).
  // Este teste troca a moeda e VOLTA para BRL no fim para nao vazar estado.
  it('trocar a moeda repreca a vitrine e persiste a escolha', async () => {
    await renderReady();

    fireEvent.click(screen.getByTestId('credits-currency-select-usd-button'));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        API.BILLING_CHARGE_CURRENCY,
        { currency: 'USD' },
        { skipAuthRedirect: true },
      ),
    );
    await waitFor(() => expect(pack10Card().getByText('US$ 190,00')).toBeInTheDocument());
    expect(singleCard().getByText('US$ 25,00')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('credits-currency-select-brl-button'));
    await waitFor(() => expect(pack10Card().getByText('R$ 950,00')).toBeInTheDocument());
  });
});
