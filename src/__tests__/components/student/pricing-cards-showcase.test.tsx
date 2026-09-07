import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PricingCards, type PricingCardsProps } from '@/components/student/pricing-cards';
import { apiClient } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import {
  PLAN_SELECTION_TTL_MS,
  readPlanSelection,
  savePlanSelection,
} from '@/lib/constants/landing';
import ptBR from '../../../../i18n/messages/pt-BR.json';

/**
 * Duas garantias da vitrine que preco correto nao cobre.
 *
 * 1. O DESCONTO DE PRIMEIRA AULA E DO SERVIDOR. A vitrine mostra US$ 12,50
 *    quando `isFirstPurchase`, mas o corpo do checkout continua pedindo
 *    `SINGLE`: quem decide aplicar PROMO e a rota, que rele `isFirstPurchase`
 *    do banco (`src/app/api/v1/checkout/route.ts:64`) antes de chamar
 *    `checkout.service.ts:58`. Se o cliente pudesse nomear o pacote
 *    promocional, bastaria repetir a compra para pagar metade sempre.
 *
 * 2. A ESCOLHA FEITA NA LANDING SOBREVIVE AO CADASTRO. Entre clicar num plano
 *    na landing e chegar aqui existem confirmacao de e-mail (que costuma abrir
 *    outra aba) e login. A URL nao atravessa isso; o registro em `localStorage`
 *    atravessa, e e consumido UMA vez.
 *
 * O irmao `src/__tests__/components/credits/pricing-cards.test.tsx` cobre
 * catalogo, precos em BRL, rotulos e estados de carregamento — nao repetimos.
 */

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
}));

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
const CHECKOUT_URL = 'https://checkout.stripe.com/test';
const realLocation = window.location;

afterAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

async function renderReady(props: PricingCardsProps = {}) {
  const utils = render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <PricingCards {...props} />
    </NextIntlClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('credits-currency-select')).toHaveAttribute('aria-busy', 'false'),
  );
  return utils;
}

describe('PricingCards: desconto de primeira aula', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '', origin: realLocation.origin, assign: vi.fn(), replace: vi.fn() },
    });
    api.get.mockResolvedValue({
      data: { currency: 'USD', persisted: 'USD', supported: ['BRL', 'USD', 'EUR', 'USDC'] },
    });
  });

  it('com isFirstPurchase o card mostra o preco promocional', async () => {
    await renderReady({ isFirstPurchase: true });

    expect(screen.getByTestId('credits-package-single')).toHaveTextContent('US$ 12,50');
  });

  it('mas o checkout continua pedindo SINGLE: PROMO nao sai do cliente', async () => {
    api.post.mockResolvedValueOnce({ data: { url: CHECKOUT_URL } });
    await renderReady({ isFirstPurchase: true });

    fireEvent.click(screen.getByTestId('credits-package-single-buy-button'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [route, body] = api.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(route).toBe(API.CHECKOUT);
    expect(body).toEqual({ packageType: 'SINGLE', isSubscription: false, currency: 'USD' });
    // Nenhum campo do cliente decide preco: nem o nome do pacote promocional,
    // nem uma flag de desconto paralela.
    expect(JSON.stringify(body)).not.toContain('PROMO');
    expect(body).not.toHaveProperty('isFirstPurchase');
    expect(body).not.toHaveProperty('discount');
  });

  it('o corpo enviado nao muda com ou sem primeira compra', async () => {
    api.post.mockResolvedValue({ data: { url: CHECKOUT_URL } });

    const first = await renderReady({ isFirstPurchase: true });
    fireEvent.click(screen.getByTestId('credits-package-single-buy-button'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const promoBody = api.post.mock.calls[0][1];
    first.unmount();

    await renderReady({ isFirstPurchase: false });
    fireEvent.click(screen.getByTestId('credits-package-single-buy-button'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1][1]).toEqual(promoBody);
  });
});

describe('PricingCards: ponte landing -> cadastro -> vitrine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.get.mockResolvedValue({
      data: { currency: 'USD', persisted: 'USD', supported: ['BRL', 'USD', 'EUR', 'USDC'] },
    });
  });

  it('sem query, a escolha guardada no cadastro seleciona o plano', async () => {
    savePlanSelection({ plan: 'MONTHLY', monthlyLessons: 20 });
    await renderReady();

    await waitFor(() =>
      expect(screen.getByTestId('credits-package-monthly')).toHaveAttribute(
        'data-selected',
        'true',
      ),
    );
    expect(screen.getByTestId('credits-monthly-option-20')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('credits-package-monthly-selected-note')).toBeInTheDocument();
  });

  it('a escolha guardada e consumida UMA vez e nao ressurge depois', async () => {
    savePlanSelection({ plan: 'PACK_10' });
    await renderReady();

    await waitFor(() =>
      expect(screen.getByTestId('credits-package-pack_10')).toHaveAttribute(
        'data-selected',
        'true',
      ),
    );
    expect(readPlanSelection()).toBeNull();
  });

  it('a query manda: com ?plan= o registro guardado e descartado', async () => {
    savePlanSelection({ plan: 'MONTHLY', monthlyLessons: 20 });
    await renderReady({ initialPlan: 'SINGLE' });

    expect(screen.getByTestId('credits-package-single')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('credits-package-monthly')).not.toHaveAttribute('data-selected');
    await waitFor(() => expect(readPlanSelection()).toBeNull());
  });

  it('escolha vencida nao preseleciona plano nenhum', async () => {
    savePlanSelection({ plan: 'PACK_10' }, Date.now() - PLAN_SELECTION_TTL_MS - 1);
    await renderReady();

    expect(screen.getByTestId('credits-package-pack_10')).not.toHaveAttribute('data-selected');
    expect(screen.queryByTestId('credits-package-pack_10-selected-note')).not.toBeInTheDocument();
  });
});
