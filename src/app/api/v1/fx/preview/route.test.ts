// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Guarda de NAO-DIVERGENCIA entre esta rota e a tabela de cambio do produto.
 *
 * A rota mantinha um `SEED_RATES` proprio com os mesmos numeros de
 * `FX_FROM_USD` (`src/lib/pricing/config.ts`). Duas tabelas com o mesmo
 * conteudo nao ficam iguais para sempre: no dia em que alguem corrige o EUR em
 * uma delas, preview e catalogo passam a contar historias diferentes sem que
 * nada quebre. Este arquivo compara a taxa que a rota RESPONDE com a taxa
 * derivada da tabela canonica importada aqui — reintroduzir qualquer tabela
 * local com valor diferente deixa este teste vermelho.
 */

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));

vi.mock('@/lib/auth-guard', () => ({ requireAuth: mockRequireAuth }));

vi.mock('@/lib/prisma', () => ({
  prisma: { fxRate: { findMany: mockFindMany } },
}));

import { FX_FROM_USD } from '@/lib/pricing/config';
import { ROUNDING_POLICY_BY_CURRENCY } from '@/lib/billing/currency-policy';
import { SUPPORTED_CURRENCIES, type Currency } from '@/lib/currency';
import { GET } from './route';

interface PreviewBody {
  data: {
    baseAmountMinor: number;
    baseCurrency: Currency;
    quoteAmountMinor: number;
    quoteCurrency: Currency;
    rate: number;
    source: string;
    roundingPolicy: string;
    quotedAt: string;
    stale: boolean;
  } | null;
  error: string | null;
}

function previewRequest(from: string, to: string, amount = 10000) {
  return new NextRequest(
    `http://localhost/api/v1/fx/preview?from=${from}&to=${to}&amount=${amount}`,
    { method: 'GET' },
  );
}

async function preview(from: string, to: string, amount = 10000) {
  const res = await GET(previewRequest(from, to, amount));
  return { status: res.status, body: (await res.json()) as PreviewBody };
}

/** Todos os pares ordenados de moedas distintas (12 com as quatro atuais). */
const CROSS_PAIRS: Array<[Currency, Currency]> = SUPPORTED_CURRENCIES.flatMap((from) =>
  SUPPORTED_CURRENCIES.filter((to) => to !== from).map((to) => [from, to] as [Currency, Currency]),
);

describe('GET /api/v1/fx/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    // Sem taxa no banco: o elo SEED da cadeia de fallback e quem responde, que
    // e exatamente o caminho alimentado pela tabela canonica.
    mockFindMany.mockResolvedValue([]);
  });

  describe('taxa SEED x tabela canonica (FX_FROM_USD)', () => {
    it.each(CROSS_PAIRS)('%s -> %s responde a taxa cruzada da tabela unica', async (from, to) => {
      const { status, body } = await preview(from, to);

      expect(status).toBe(200);
      expect(body.data?.source).toBe('SEED');
      expect(body.data?.rate).toBe(FX_FROM_USD[to] / FX_FROM_USD[from]);
    });

    it('converte o valor pela taxa da tabela, nao por numero proprio', async () => {
      const { body } = await preview('USD', 'BRL', 10000);

      expect(body.data?.quoteAmountMinor).toBe(Math.round(10000 * FX_FROM_USD.BRL));
      expect(body.data?.baseAmountMinor).toBe(10000);
      expect(body.data?.baseCurrency).toBe('USD');
      expect(body.data?.quoteCurrency).toBe('BRL');
    });

    it('par identico curto-circuita em taxa 1 sem consultar o banco', async () => {
      const { status, body } = await preview('EUR', 'EUR');

      expect(status).toBe(200);
      expect(body.data?.rate).toBe(1);
      expect(body.data?.quoteAmountMinor).toBe(10000);
      expect(mockFindMany).not.toHaveBeenCalled();
    });
  });

  describe('cadeia de fallback', () => {
    it('taxa fresca do banco vence o SEED', async () => {
      mockFindMany.mockResolvedValue([
        { source: 'OPEN_EXCHANGE_RATES', rate: 5.37, collectedAt: new Date() },
      ]);

      const { body } = await preview('USD', 'BRL');

      expect(body.data?.source).toBe('OPEN_EXCHANGE_RATES');
      expect(body.data?.rate).toBe(5.37);
      // E a prova de que o SEED nao e um piso: a taxa do banco difere da tabela.
      expect(body.data?.rate).not.toBe(FX_FROM_USD.BRL);
    });

    it('taxa stale do banco cede lugar ao SEED da tabela canonica', async () => {
      const stale = new Date(Date.now() - 72 * 60 * 60 * 1000);
      mockFindMany.mockResolvedValue([
        { source: 'OPEN_EXCHANGE_RATES', rate: 5.37, collectedAt: stale },
      ]);

      const { body } = await preview('USD', 'BRL');

      expect(body.data?.source).toBe('SEED');
      expect(body.data?.rate).toBe(FX_FROM_USD.BRL);
    });
  });

  describe('politica de arredondamento exposta na resposta', () => {
    it.each(SUPPORTED_CURRENCIES)('%s responde a politica declarada para a moeda', async (to) => {
      const from: Currency = to === 'USD' ? 'BRL' : 'USD';
      const { body } = await preview(from, to);

      expect(body.data?.roundingPolicy).toBe(ROUNDING_POLICY_BY_CURRENCY[to]);
    });

    it('a tabela de politicas cobre todas as moedas suportadas', () => {
      for (const currency of SUPPORTED_CURRENCIES) {
        expect(ROUNDING_POLICY_BY_CURRENCY[currency]).toBeTruthy();
      }
      expect(Object.keys(ROUNDING_POLICY_BY_CURRENCY).sort()).toEqual(
        [...SUPPORTED_CURRENCIES].sort(),
      );
    });
  });

  describe('entrada invalida', () => {
    it('recusa moeda nao suportada com 400 e mensagem', async () => {
      const { status, body } = await preview('USD', 'JPY');

      expect(status).toBe(400);
      expect(body.data).toBeNull();
      expect(body.error).toBe('Moeda de destino nao suportada.');
    });
  });
});
