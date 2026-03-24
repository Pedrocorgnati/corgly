import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { PricingSection } from '@/components/landing/pricing-section';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  landing: {
    pricing: {
      badge: 'Planos',
      title: 'Escolha seu plano',
      subtitle: 'Pacotes para todos os niveis',
      discount_banner: 'Primeira aula 50% OFF!',
      most_popular: 'Mais Popular',
      lessons_suffix: 'aulas',
      lesson_suffix: 'aula',
      per_lesson_suffix: '/aula',
      packages: {
        single: {
          name: 'Aula Avulsa',
          features: ['1 aula ao vivo', 'Feedback personalizado'],
          cta: 'Comprar',
        },
        pack5: {
          name: 'Pacote 5',
          features: ['5 aulas ao vivo', 'Materiais inclusos'],
          cta: 'Comprar',
        },
        pack10: {
          name: 'Pacote 10',
          features: ['10 aulas ao vivo', 'Melhor custo-beneficio'],
          cta: 'Comprar',
        },
        monthly: {
          name: 'Mensal',
          features: ['8 aulas/mes', 'Assinatura recorrente'],
          cta: 'Assinar',
        },
      },
    },
  },
};

function renderWithI18n(props: Parameters<typeof PricingSection>[0] = {}) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <PricingSection {...props} />
    </NextIntlClientProvider>
  );
}

describe('PricingSection', () => {
  it('renderiza titulo e subtitulo i18n', () => {
    renderWithI18n();

    expect(screen.getByText('Escolha seu plano')).toBeInTheDocument();
    expect(screen.getByText('Pacotes para todos os niveis')).toBeInTheDocument();
  });

  it('renderiza badge de planos', () => {
    renderWithI18n();

    expect(screen.getByText('Planos')).toBeInTheDocument();
  });

  it('renderiza os 4 planos', () => {
    renderWithI18n();

    expect(screen.getByText('Aula Avulsa')).toBeInTheDocument();
    expect(screen.getByText('Pacote 5')).toBeInTheDocument();
    expect(screen.getByText('Pacote 10')).toBeInTheDocument();
    expect(screen.getByText('Mensal')).toBeInTheDocument();
  });

  it('exibe badge "Mais Popular" no plano pack10', () => {
    renderWithI18n();

    expect(screen.getByText('Mais Popular')).toBeInTheDocument();
  });

  it('mostra banner de desconto por padrao (isFirstPurchase undefined)', () => {
    renderWithI18n();

    expect(screen.getByText('Primeira aula 50% OFF!')).toBeInTheDocument();
  });

  it('oculta banner de desconto quando isFirstPurchase=false', () => {
    renderWithI18n({ isFirstPurchase: false });

    expect(screen.queryByText('Primeira aula 50% OFF!')).not.toBeInTheDocument();
  });

  it('CTAs apontam para /auth/register quando nao autenticado', () => {
    renderWithI18n({ isAuthenticated: false });

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/auth/register');
    });
  });

  it('CTAs apontam para /buy quando autenticado', () => {
    renderWithI18n({ isAuthenticated: true });

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/credits');
    });
  });

  it('exibe precos corretos', () => {
    renderWithI18n();

    expect(screen.getByText('$25')).toBeInTheDocument();
    expect(screen.getByText('$110')).toBeInTheDocument();
    expect(screen.getByText('$190')).toBeInTheDocument();
    expect(screen.getByText('$139')).toBeInTheDocument();
  });

  it('secao tem id "precos" para navegacao por ancora', () => {
    renderWithI18n();

    const section = document.getElementById('precos');
    expect(section).toBeInTheDocument();
  });
});
