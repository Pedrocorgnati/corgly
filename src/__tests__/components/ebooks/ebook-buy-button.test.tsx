import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EbookBuyButton } from '@/components/ebooks/ebook-buy-button';

import { regressionEntry } from './_entry';

const props = {
  slug: regressionEntry.slug,
  labels: { buy: 'Comprar', loading: 'Carregando', waiver: 'Renuncio ao prazo' },
  errors: {
    rateLimited: 'Aguarde {seconds}s',
    rateLimitedNoWait: 'Tente depois',
    failed: 'Falhou',
    network: 'Sem rede',
  },
  checkoutUnavailable: 'Indisponivel',
  checkoutFailed: 'Checkout falhou',
};

const assign = vi.fn();
const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function clickBuy() {
  fireEvent.click(screen.getByTestId('ebook-buy-waiver'));
  fireEvent.click(screen.getByTestId('ebook-buy-button'));
}

describe('EbookBuyButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    assign.mockReset();
    vi.unstubAllGlobals();
  });

  it('mantem o botao desabilitado ate aceitar a renuncia', () => {
    render(<EbookBuyButton {...props} />);
    const button = screen.getByTestId('ebook-buy-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('ebook-buy-waiver'));
    expect(button.disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia slug e renuncia e navega para o checkoutUrl em 201', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { checkoutUrl: 'https://pay.test/abc' } }));
    render(<EbookBuyButton {...props} />);
    await clickBuy();

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.test/abc'));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/ebooks/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      slug: regressionEntry.slug,
      withdrawalWaiver: true,
    });
    expect((screen.getByTestId('ebook-buy-button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('ebook-buy-error')).toBeNull();
  });

  it('mostra o estado de loading enquanto aguarda a resposta', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    const button = screen.getByTestId('ebook-buy-button');
    expect(button.textContent).toBe('Carregando');
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('ignora segundo clique enquanto carrega', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    fireEvent.click(screen.getByTestId('ebook-buy-button'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429 com Retry-After numerico informa os segundos', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { code: 'EBOOK_CHECKOUT_RATE_LIMITED' }, { 'Retry-After': '30' }),
    );
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    expect((await screen.findByTestId('ebook-buy-error')).textContent).toBe('Aguarde 30s');
  });

  it.each([['0'], ['abc'], ['-5'], ['1.5']])('429 com Retry-After "%s" cai em sem espera', async (value) => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { code: 'EBOOK_CHECKOUT_RATE_LIMITED' }, { 'Retry-After': value }),
    );
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    expect((await screen.findByTestId('ebook-buy-error')).textContent).toBe('Tente depois');
  });

  it('429 sem Retry-After cai em sem espera', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { code: 'EBOOK_CHECKOUT_RATE_LIMITED' }));
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    expect((await screen.findByTestId('ebook-buy-error')).textContent).toBe('Tente depois');
  });

  it('UNAVAILABLE usa a copia do ebook', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { code: 'EBOOK_CHECKOUT_UNAVAILABLE' }));
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    expect((await screen.findByTestId('ebook-buy-error')).textContent).toBe('Indisponivel');
  });

  it.each([['EBOOK_CHECKOUT_GATEWAY_ERROR'], ['EBOOK_CHECKOUT_GATEWAY_TIMEOUT']])(
    '%s usa a copia de checkout falhou',
    async (code) => {
      fetchMock.mockResolvedValue(jsonResponse(502, { code }));
      render(<EbookBuyButton {...props} />);
      await clickBuy();
      expect((await screen.findByTestId('ebook-buy-error')).textContent).toBe('Checkout falhou');
    },
  );

  it('JSON invalido cai em failed e libera nova tentativa', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 500 }));
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    expect((await screen.findByTestId('ebook-buy-error')).textContent).toBe('Falhou');
    expect((screen.getByTestId('ebook-buy-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('201 sem checkoutUrl cai em failed e nao navega', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: {} }));
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    expect((await screen.findByTestId('ebook-buy-error')).textContent).toBe('Falhou');
    expect(assign).not.toHaveBeenCalled();
  });

  it('fetch rejeitado mostra erro de rede', async () => {
    fetchMock.mockRejectedValue(new TypeError('fail'));
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    expect((await screen.findByTestId('ebook-buy-error')).textContent).toBe('Sem rede');
  });

  it('nova tentativa limpa o erro anterior', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fail'));
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    render(<EbookBuyButton {...props} />);
    await clickBuy();
    await screen.findByTestId('ebook-buy-error');
    fireEvent.click(screen.getByTestId('ebook-buy-button'));
    await waitFor(() => expect(screen.queryByTestId('ebook-buy-error')).toBeNull());
  });
});
