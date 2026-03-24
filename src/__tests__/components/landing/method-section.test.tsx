import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { MethodSection } from '@/components/landing/method-section';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  landing: {
    method: {
      badge: 'Nosso Metodo',
      title: 'Corgly Method',
      subtitle: 'Uma abordagem unica para aprender portugues',
      pillars: {
        commitment: {
          title: 'Comprometimento',
          description: 'Dedicacao ao aprendizado',
        },
        time_boxed: {
          title: 'Time-boxed',
          description: 'Sessoes com tempo definido',
        },
        cycle_based: {
          title: 'Ciclos',
          description: 'Aprendizado em ciclos',
        },
        shared_context: {
          title: 'Contexto Compartilhado',
          description: 'Aprendizado contextual',
        },
        feedback_loop: {
          title: 'Feedback Loop',
          description: 'Feedback continuo',
        },
      },
    },
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <MethodSection />
    </NextIntlClientProvider>
  );
}

describe('MethodSection', () => {
  it('renderiza titulo e subtitulo i18n', () => {
    renderWithI18n();

    expect(screen.getByText('Corgly Method')).toBeInTheDocument();
    expect(screen.getByText('Uma abordagem unica para aprender portugues')).toBeInTheDocument();
  });

  it('renderiza badge do metodo', () => {
    renderWithI18n();

    expect(screen.getByText('Nosso Metodo')).toBeInTheDocument();
  });

  it('renderiza todos os 5 pilares', () => {
    renderWithI18n();

    expect(screen.getByText('Comprometimento')).toBeInTheDocument();
    expect(screen.getByText('Time-boxed')).toBeInTheDocument();
    expect(screen.getByText('Ciclos')).toBeInTheDocument();
    expect(screen.getByText('Contexto Compartilhado')).toBeInTheDocument();
    expect(screen.getByText('Feedback Loop')).toBeInTheDocument();
  });

  it('renderiza descricao de cada pilar', () => {
    renderWithI18n();

    expect(screen.getByText('Dedicacao ao aprendizado')).toBeInTheDocument();
    expect(screen.getByText('Sessoes com tempo definido')).toBeInTheDocument();
    expect(screen.getByText('Aprendizado em ciclos')).toBeInTheDocument();
    expect(screen.getByText('Aprendizado contextual')).toBeInTheDocument();
    expect(screen.getByText('Feedback continuo')).toBeInTheDocument();
  });

  it('possui heading com id correto para aria-labelledby', () => {
    renderWithI18n();

    const heading = screen.getByRole('heading', { name: 'Corgly Method' });
    expect(heading).toHaveAttribute('id', 'method-heading');
  });

  it('secao tem id "metodo" para navegacao por ancora', () => {
    renderWithI18n();

    const section = document.getElementById('metodo');
    expect(section).toBeInTheDocument();
  });
});
