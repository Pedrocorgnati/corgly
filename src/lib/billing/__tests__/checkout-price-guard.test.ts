import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';
import { AppError } from '@/lib/errors';
import type { PricePoint } from '@/lib/pricing/config';

/**
 * Trava de `buildGuardedLineItem` — a UNICA defesa entre o preco exibido na
 * vitrine e o valor efetivamente cobrado pelo Stripe.
 *
 * Ate aqui a funcao nao tinha teste nenhum: `checkout.service.test.ts` mocka
 * `@/lib/pricing/config` devolvendo sempre `priceId: null`, entao o ramo que
 * confronta o Price remoto — o ramo inteiro que existe para impedir a cobranca
 * divergente — nunca era executado. Uma regressao que trocasse o `throw` por um
 * fallback em `price_data` passaria verde.
 *
 * Este arquivo NAO mocka `@/lib/pricing/config`: o catalogo e as regras de
 * moeda entram de verdade (inclusive `USDC -> 'usd'`). Mocka apenas o boundary
 * de rede (`prices.retrieve`).
 */

const pricesRetrieve = vi.fn();

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    prices: { retrieve: pricesRetrieve },
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  },
}));

import { buildGuardedLineItem } from '@/lib/billing/checkout.service';

/** Price remoto minimo, com os campos que o guard confronta. */
function remotePrice(overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  return {
    id: 'price_remote',
    object: 'price',
    active: true,
    currency: 'usd',
    unit_amount: 19000,
    recurring: null,
    ...overrides,
  } as Stripe.Price;
}

const CATALOG: PricePoint = { amountCents: 19000, priceId: 'price_remote' };

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('buildGuardedLineItem - Price remoto conferido', () => {
  it('Price remoto identico ao catalogo: usa o priceId pre-cadastrado', async () => {
    pricesRetrieve.mockResolvedValue(remotePrice());

    const item = await buildGuardedLineItem({
      price: CATALOG,
      currency: 'USD',
      productName: 'Pacote 10 aulas',
    });

    expect(pricesRetrieve).toHaveBeenCalledWith('price_remote');
    expect(item).toEqual({ price: 'price_remote', quantity: 1 });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('assinatura mensal com recorrencia mensal casada: usa o priceId', async () => {
    pricesRetrieve.mockResolvedValue(
      remotePrice({
        unit_amount: 17000,
        recurring: { interval: 'month', interval_count: 1 } as Stripe.Price.Recurring,
      }),
    );

    const item = await buildGuardedLineItem({
      price: { amountCents: 17000, priceId: 'price_remote' },
      currency: 'USD',
      productName: 'Assinatura 10 aulas',
      recurring: { interval: 'month' },
    });

    expect(item).toEqual({ price: 'price_remote', quantity: 1 });
  });

  it('USDC e cobrado como usd: Price em usd NAO e tratado como divergencia', async () => {
    pricesRetrieve.mockResolvedValue(remotePrice({ currency: 'usd' }));

    const item = await buildGuardedLineItem({
      price: CATALOG,
      currency: 'USDC',
      productName: 'Pacote 10 aulas',
    });

    expect(item).toEqual({ price: 'price_remote', quantity: 1 });
  });
});

describe('buildGuardedLineItem - divergencia bloqueia a cobranca', () => {
  it('unit_amount diferente do catalogo: PAYMENT_090 e nenhum line item', async () => {
    pricesRetrieve.mockResolvedValue(remotePrice({ unit_amount: 19900 }));

    await expect(
      buildGuardedLineItem({ price: CATALOG, currency: 'USD', productName: 'Pacote 10 aulas' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_090', status: 500 });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('Price sem unit_amount (tiered/decimal) tambem diverge', async () => {
    pricesRetrieve.mockResolvedValue(remotePrice({ unit_amount: null }));

    await expect(
      buildGuardedLineItem({ price: CATALOG, currency: 'USD', productName: 'Pacote 10 aulas' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_090' });
  });

  it('moeda diferente da cobranca: PAYMENT_090', async () => {
    pricesRetrieve.mockResolvedValue(remotePrice({ currency: 'brl' }));

    await expect(
      buildGuardedLineItem({ price: CATALOG, currency: 'USD', productName: 'Pacote 10 aulas' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_090' });
  });

  it('Price inativo no Stripe: PAYMENT_090', async () => {
    pricesRetrieve.mockResolvedValue(remotePrice({ active: false }));

    await expect(
      buildGuardedLineItem({ price: CATALOG, currency: 'USD', productName: 'Pacote 10 aulas' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_090' });
  });

  it('compra avulsa apontando para Price recorrente: PAYMENT_090', async () => {
    pricesRetrieve.mockResolvedValue(
      remotePrice({ recurring: { interval: 'month', interval_count: 1 } as Stripe.Price.Recurring }),
    );

    await expect(
      buildGuardedLineItem({ price: CATALOG, currency: 'USD', productName: 'Pacote 10 aulas' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_090' });
  });

  it('assinatura apontando para Price avulso: PAYMENT_090', async () => {
    pricesRetrieve.mockResolvedValue(remotePrice({ recurring: null }));

    await expect(
      buildGuardedLineItem({
        price: CATALOG,
        currency: 'USD',
        productName: 'Assinatura',
        recurring: { interval: 'month' },
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_090' });
  });

  it('assinatura com intervalo anual em vez de mensal: PAYMENT_090', async () => {
    pricesRetrieve.mockResolvedValue(
      remotePrice({ recurring: { interval: 'year', interval_count: 1 } as Stripe.Price.Recurring }),
    );

    await expect(
      buildGuardedLineItem({
        price: CATALOG,
        currency: 'USD',
        productName: 'Assinatura',
        recurring: { interval: 'month' },
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_090' });
  });

  it('assinatura mensal cobrada a cada 3 meses (interval_count != 1): PAYMENT_090', async () => {
    pricesRetrieve.mockResolvedValue(
      remotePrice({ recurring: { interval: 'month', interval_count: 3 } as Stripe.Price.Recurring }),
    );

    await expect(
      buildGuardedLineItem({
        price: CATALOG,
        currency: 'USD',
        productName: 'Assinatura',
        recurring: { interval: 'month' },
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_090' });
  });
});

describe('buildGuardedLineItem - Price ilegivel', () => {
  it('falha na consulta ao Stripe: PAYMENT_091 e NENHUM fallback para price_data', async () => {
    pricesRetrieve.mockRejectedValue(new Error('network down'));

    // O que este teste prova nao e so o codigo do erro: e que NENHUM line item
    // foi produzido. Um fallback para `price_data` resolveria a promise e
    // cobraria sem ter conferido nada — `produced` denuncia isso.
    let produced: unknown = null;
    let thrown: unknown = null;
    try {
      produced = await buildGuardedLineItem({
        price: CATALOG,
        currency: 'USD',
        productName: 'Pacote 10 aulas',
      });
    } catch (err) {
      thrown = err;
    }

    expect(produced).toBeNull();
    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({ code: 'PAYMENT_091', status: 500 });
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('buildGuardedLineItem - sem Price pre-cadastrado', () => {
  it('cai em price_data com o valor canonico e nao consulta o Stripe', async () => {
    const item = await buildGuardedLineItem({
      price: { amountCents: 2500 },
      currency: 'BRL',
      productName: 'Aula avulsa',
    });

    expect(pricesRetrieve).not.toHaveBeenCalled();
    expect(item).toEqual({
      price_data: {
        currency: 'brl',
        unit_amount: 2500,
        product_data: { name: 'Aula avulsa' },
      },
      quantity: 1,
    });
  });

  it('price_data de assinatura carrega a recorrencia mensal', async () => {
    const item = await buildGuardedLineItem({
      price: { amountCents: 15640 },
      currency: 'EUR',
      productName: 'Assinatura 10 aulas',
      recurring: { interval: 'month' },
    });

    expect(item).toEqual({
      price_data: {
        currency: 'eur',
        unit_amount: 15640,
        product_data: { name: 'Assinatura 10 aulas' },
        recurring: { interval: 'month' },
      },
      quantity: 1,
    });
  });
});
