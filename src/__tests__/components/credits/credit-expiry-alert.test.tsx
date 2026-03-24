import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { CreditExpiryAlert } from '@/components/credits/credit-expiry-alert';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  credits: {
    expiryAlert: {
      message: '{count} créditos expiram em {days} dias.',
      buyNow: 'Comprar agora',
      dismiss: 'Fechar alerta',
    },
  },
};

function renderWithI18n(batches: Array<{ expiresAt: string; totalCredits: number; usedCredits: number }>) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <CreditExpiryAlert batches={batches} />
    </NextIntlClientProvider>
  );
}

function futureDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

describe('CreditExpiryAlert', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renderiza null quando não há batches expirando', () => {
    const { container } = renderWithI18n([]);
    expect(container.innerHTML).toBe('');
  });

  it('renderiza null quando batches expiram em mais de 7 dias', () => {
    const { container } = renderWithI18n([
      { expiresAt: futureDays(10), totalCredits: 5, usedCredits: 0 },
    ]);
    expect(container.innerHTML).toBe('');
  });

  it('renderiza alerta quando batch expira em menos de 7 dias', () => {
    renderWithI18n([
      { expiresAt: futureDays(3), totalCredits: 5, usedCredits: 2 },
    ]);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Comprar agora')).toBeInTheDocument();
  });

  it('tem role="alert" e aria-live="polite"', () => {
    renderWithI18n([
      { expiresAt: futureDays(3), totalCredits: 5, usedCredits: 0 },
    ]);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it('dismiss oculta o alerta e persiste no localStorage', () => {
    renderWithI18n([
      { expiresAt: futureDays(3), totalCredits: 5, usedCredits: 0 },
    ]);

    const dismissBtn = screen.getByLabelText('Fechar alerta');
    fireEvent.click(dismissBtn);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('link "Comprar agora" aponta para /credits', () => {
    renderWithI18n([
      { expiresAt: futureDays(3), totalCredits: 5, usedCredits: 0 },
    ]);

    const link = screen.getByText('Comprar agora');
    expect(link).toHaveAttribute('href', '/credits');
  });

  it('renderiza null quando todos os créditos do batch já foram usados', () => {
    const { container } = renderWithI18n([
      { expiresAt: futureDays(3), totalCredits: 5, usedCredits: 5 },
    ]);
    expect(container.innerHTML).toBe('');
  });
});
