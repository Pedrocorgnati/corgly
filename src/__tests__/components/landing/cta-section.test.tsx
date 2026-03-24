import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { CTASection } from '@/components/landing/cta-section';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  landing: {
    cta: {
      title: 'Comece Hoje',
      subtitle: 'Sua jornada de aprendizado comeca agora',
      button: 'Criar Conta Gratis',
      button_secondary: 'Ver Precos',
    },
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <CTASection />
    </NextIntlClientProvider>
  );
}

describe('CTASection', () => {
  it('renderiza titulo e subtitulo i18n', () => {
    renderWithI18n();

    expect(screen.getByText('Comece Hoje')).toBeInTheDocument();
    expect(screen.getByText('Sua jornada de aprendizado comeca agora')).toBeInTheDocument();
  });

  it('renderiza botao primario', () => {
    renderWithI18n();

    expect(screen.getByText('Criar Conta Gratis')).toBeInTheDocument();
  });

  it('renderiza botao secundario', () => {
    renderWithI18n();

    expect(screen.getByText('Ver Precos')).toBeInTheDocument();
  });

  it('botao primario aponta para /auth/register', () => {
    renderWithI18n();

    const links = screen.getAllByRole('link');
    const registerLink = links.find((l) => l.getAttribute('href') === '/auth/register');
    expect(registerLink).toBeDefined();
  });

  it('botao secundario aponta para ancora #precos', () => {
    renderWithI18n();

    const links = screen.getAllByRole('link');
    const pricingLink = links.find((l) => l.getAttribute('href') === '#precos');
    expect(pricingLink).toBeDefined();
  });

  it('possui heading com id correto para aria-labelledby', () => {
    renderWithI18n();

    const heading = screen.getByRole('heading', { name: 'Comece Hoje' });
    expect(heading).toHaveAttribute('id', 'cta-heading');
  });
});
