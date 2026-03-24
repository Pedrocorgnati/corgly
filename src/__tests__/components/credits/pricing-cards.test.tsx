import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PricingCards } from '@/components/student/pricing-cards';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const messages = {
  credits: {
    pricing: {
      singleTitle: 'Aula avulsa',
      singleDesc: '1 crédito',
      pack5Title: 'Pack 5 aulas',
      pack5Desc: '5 créditos',
      pack5Badge: 'Mais popular',
      pack10Title: 'Pack 10 aulas',
      pack10Desc: '10 créditos',
      pack10Badge: 'Melhor custo-benefício',
      monthlyTitle: 'Mensal',
      monthlyDesc: '8 créditos/mês',
      buyBtn: 'Comprar',
      subscribing: 'Assinando...',
      buying: 'Comprando...',
      perLesson: '/aula',
      perMonth: '/mês',
    },
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <PricingCards />
    </NextIntlClientProvider>
  );
}

describe('PricingCards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza 4 cards de preço', () => {
    renderWithI18n();

    expect(screen.getByText('Aula avulsa')).toBeInTheDocument();
    expect(screen.getByText('Pack 5 aulas')).toBeInTheDocument();
    expect(screen.getByText('Pack 10 aulas')).toBeInTheDocument();
    expect(screen.getByText('Mensal')).toBeInTheDocument();
  });

  it('renderiza 4 botões de compra', () => {
    renderWithI18n();

    const buyButtons = screen.getAllByRole('button', { name: /comprar/i });
    expect(buyButtons).toHaveLength(4);
  });

  it('exibe badge "Melhor custo-benefício" no pack10', () => {
    renderWithI18n();

    expect(screen.getByText('Melhor custo-benefício')).toBeInTheDocument();
  });

  it('mostra loading state ao clicar em comprar', async () => {
    global.fetch = vi.fn(() =>
      new Promise(() => {}) // Never resolves — keeps loading
    ) as unknown as typeof fetch;

    renderWithI18n();

    const buyButtons = screen.getAllByRole('button', { name: /comprar/i });
    fireEvent.click(buyButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Comprando...')).toBeInTheDocument();
    });
  });

  it('chama fetch POST /api/v1/checkout ao comprar', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { url: 'https://checkout.stripe.com/test', sessionId: 'cs_test' } }),
    });
    global.fetch = mockFetch;

    // Mock window.location.href assignment
    const locationSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
    });

    renderWithI18n();

    const buyButtons = screen.getAllByRole('button', { name: /comprar/i });
    fireEvent.click(buyButtons[0]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/checkout', expect.objectContaining({
        method: 'POST',
      }));
    });

    locationSpy.mockRestore();
  });

  it('mostra toast de erro em caso de falha na API', async () => {
    const { toast } = await import('sonner');
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Erro de teste' }),
    });

    renderWithI18n();

    const buyButtons = screen.getAllByRole('button', { name: /comprar/i });
    fireEvent.click(buyButtons[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Erro de teste');
    });
  });
});
