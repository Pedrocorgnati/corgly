/**
 * Item 009 — contrato de retorno do auxiliar `apiFetch` (`src/actions/sessions.ts`).
 *
 * `apiFetch` publica `Promise<{ data: T | null; error: string | null }>`: um par,
 * nunca uma excecao. Antes deste item ele lia `await res.json()` sem guarda, e
 * corpo ilegivel (405 sem corpo, HTML de gateway do Passenger em 502/504) fazia a
 * promessa REJEITAR. `HistoryPage` (`src/app/(student)/history/page.tsx` linha 34)
 * chama `getSessions` num `Promise.all` sem `try/catch`: a rejeicao subia pelo
 * render e trocava a rota inteira pela fronteira de erro.
 *
 * `apiFetch` nao e exportado. A sonda mais fina e `getAvailability`, que valida o
 * mes e devolve o par do auxiliar sem transformar nada.
 *
 * `vi.stubGlobal('fetch', ...)` no lugar de handler MSW: `vitest.setup.ts` sobe o
 * `server` do MSW para a suite inteira, e o stub global da controle byte a byte
 * do corpo (vazio, HTML, truncado) com `content-type` proprio. `afterEach`
 * devolve o `fetch` do MSW aos demais arquivos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'corgly_token=jwt-de-teste' }),
  headers: async () => new Headers({ host: 'localhost:3000' }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { revalidatePath } from 'next/cache';

import { bookSession, getAvailability, getSessions } from '@/actions/sessions';
import { PAGINATION } from '@/lib/constants';
import { logger } from '@/lib/logger';

function resposta(status: number, body: BodyInit | null, contentType = 'application/json') {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

function stubFetch(res: Response) {
  const spy = vi.fn(async () => res);
  vi.stubGlobal('fetch', spy);
  return spy;
}

const HTML_GATEWAY = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('apiFetch — corpo ilegivel devolve par, nunca rejeita (item 009)', () => {
  it('C-A: 405 sem corpo devolve { data: null, error: "Erro 405" }', async () => {
    stubFetch(resposta(405, null));

    await expect(getAvailability('2026-03')).resolves.toEqual({
      data: null,
      error: 'Erro 405',
    });
  });

  it('C-B: 502 com HTML de gateway devolve { data: null, error: "Erro 502" }', async () => {
    stubFetch(resposta(502, HTML_GATEWAY, 'text/html'));

    await expect(getAvailability('2026-03')).resolves.toEqual({
      data: null,
      error: 'Erro 502',
    });
  });

  it('C-C: caminho ilegivel registra logger.error com path, status e a excecao', async () => {
    stubFetch(resposta(502, HTML_GATEWAY, 'text/html'));

    await getAvailability('2026-03');

    expect(logger.error).toHaveBeenCalledTimes(1);
    // O 3o argumento e o que preserva o stack do SyntaxError do corpo ilegivel;
    // sem ele o log do 502/504-HTML sai sem causa (assinatura em src/lib/logger.ts).
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        action: 'actions.sessions.apiFetch',
        path: expect.stringContaining('/api/v1/availability'),
        status: 502,
      }),
      expect.any(Error),
    );
  });

  it('C-D: 402 com JSON preserva a mensagem estruturada da API', async () => {
    stubFetch(
      resposta(402, JSON.stringify({ data: null, error: 'INSUFFICIENT_CREDITS', message: null })),
    );

    const result = await getAvailability('2026-03');

    expect(result.error).toBe('INSUFFICIENT_CREDITS');
    expect(result.data).toBeNull();
  });

  it('C-E: 400 com JSON sem campo error cai no fallback de status', async () => {
    stubFetch(resposta(400, JSON.stringify({ data: null })));

    const result = await getAvailability('2026-03');

    expect(result.error).toBe('Erro 400');
  });

  it('C-F: 200 com envelope valido devolve data e error null', async () => {
    stubFetch(
      resposta(
        200,
        JSON.stringify({
          data: [
            {
              id: 's1',
              startAt: '2026-03-02T13:00:00.000Z',
              endAt: '2026-03-02T13:50:00.000Z',
              isBlocked: false,
            },
          ],
          error: null,
        }),
      ),
    );

    const result = await getAvailability('2026-03');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.id).toBe('s1');
  });

  it('C-G: 200 com corpo ilegivel nao vira sucesso vazio', async () => {
    stubFetch(resposta(200, '<html>truncado', 'text/html'));

    const result = await getAvailability('2026-03');

    expect(result).toEqual({ data: null, error: 'Resposta ilegível do servidor.' });
    expect(result.error).not.toBeNull();
  });

  it('C-H: mes invalido nao chega ao fetch', async () => {
    const spy = stubFetch(resposta(200, JSON.stringify({ data: [], error: null })));

    await expect(getAvailability('2026-13')).resolves.toEqual({
      data: null,
      error: 'Mês inválido. Use formato YYYY-MM.',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('chamadores recebem par, nao rejeicao (item 009)', () => {
  it('C-I: getSessions com 405 devolve a pagina vazia', async () => {
    stubFetch(resposta(405, null));

    await expect(getSessions({ page: 1 })).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: PAGINATION.DEFAULT,
      totalPages: 0,
    });
  });

  it('C-J: bookSession com 502 HTML nao revalida rota', async () => {
    stubFetch(resposta(502, HTML_GATEWAY, 'text/html'));

    const result = await bookSession('slot-1');

    expect(result).toEqual({ data: null, error: 'Erro 502' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('C-K: bookSession com erro de credito preserva a mensagem e nao revalida', async () => {
    stubFetch(resposta(400, JSON.stringify({ data: null, error: 'Créditos insuficientes.' })));

    const result = await bookSession('slot-1');

    expect(result.error).toBe('Créditos insuficientes.');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
