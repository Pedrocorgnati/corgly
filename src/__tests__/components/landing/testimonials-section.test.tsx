import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { TestimonialsSection } from '@/components/landing/testimonials-section';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  landing: {
    testimonials: {
      title: 'O que dizem nossos alunos',
      subtitle: 'Depoimentos reais de estudantes',
      items: {
        maria: {
          name: 'Maria Silva',
          text: 'Excelente professor!',
          country: 'Italia',
        },
        giulia: {
          name: 'Giulia Rossi',
          text: 'Melhor curso de portugues.',
          country: 'Italia',
        },
        james: {
          name: 'James Smith',
          text: 'Highly recommended!',
          country: 'EUA',
        },
      },
    },
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <TestimonialsSection />
    </NextIntlClientProvider>
  );
}

describe('TestimonialsSection', () => {
  it('renderiza titulo e subtitulo i18n', () => {
    renderWithI18n();

    expect(screen.getByText('O que dizem nossos alunos')).toBeInTheDocument();
    expect(screen.getByText('Depoimentos reais de estudantes')).toBeInTheDocument();
  });

  it('renderiza os 3 depoimentos', () => {
    renderWithI18n();

    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Giulia Rossi')).toBeInTheDocument();
    expect(screen.getByText('James Smith')).toBeInTheDocument();
  });

  it('renderiza texto de cada depoimento', () => {
    renderWithI18n();

    expect(screen.getByText(/Excelente professor/)).toBeInTheDocument();
    expect(screen.getByText(/Melhor curso de portugues/)).toBeInTheDocument();
    expect(screen.getByText(/Highly recommended/)).toBeInTheDocument();
  });

  it('renderiza paises dos depoimentos', () => {
    renderWithI18n();

    // Maria and Giulia are both from Italia, so there are 2 occurrences
    const italiaElements = screen.getAllByText('Italia');
    expect(italiaElements).toHaveLength(2);
    expect(screen.getByText('EUA')).toBeInTheDocument();
  });

  it('possui heading com id correto para aria-labelledby', () => {
    renderWithI18n();

    const heading = screen.getByRole('heading', { name: 'O que dizem nossos alunos' });
    expect(heading).toHaveAttribute('id', 'testimonials-heading');
  });
});
