import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { FAQSection } from '@/components/landing/faq-section';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  landing: {
    faq: {
      title: 'Perguntas Frequentes',
      items: {
        how_it_works: { q: 'Como funciona?', a: 'Voce agenda uma aula.' },
        duration: { q: 'Quanto dura?', a: '50 minutos.' },
        cancel: { q: 'Posso cancelar?', a: 'Sim, ate 24h antes.' },
        timezone: { q: 'Qual fuso horario?', a: 'Qualquer fuso.' },
        credits_expire: { q: 'Creditos expiram?', a: 'Validos por 90 dias.' },
        first_lesson: { q: 'Como e a primeira aula?', a: 'Uma aula de nivelamento.' },
      },
    },
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <FAQSection />
    </NextIntlClientProvider>
  );
}

describe('FAQSection', () => {
  it('renderiza titulo i18n', () => {
    renderWithI18n();

    expect(screen.getByText('Perguntas Frequentes')).toBeInTheDocument();
  });

  it('renderiza todas as 6 perguntas', () => {
    renderWithI18n();

    expect(screen.getByText('Como funciona?')).toBeInTheDocument();
    expect(screen.getByText('Quanto dura?')).toBeInTheDocument();
    expect(screen.getByText('Posso cancelar?')).toBeInTheDocument();
    expect(screen.getByText('Qual fuso horario?')).toBeInTheDocument();
    expect(screen.getByText('Creditos expiram?')).toBeInTheDocument();
    expect(screen.getByText('Como e a primeira aula?')).toBeInTheDocument();
  });

  it('possui heading com id correto para aria-labelledby', () => {
    renderWithI18n();

    const heading = screen.getByRole('heading', { name: 'Perguntas Frequentes' });
    expect(heading).toHaveAttribute('id', 'faq-heading');
  });

  it('secao tem id "faq" para navegacao por ancora', () => {
    renderWithI18n();

    const section = document.getElementById('faq');
    expect(section).toBeInTheDocument();
  });
});
