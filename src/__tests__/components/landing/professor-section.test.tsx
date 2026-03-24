import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ProfessorSection } from '@/components/landing/professor-section';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  landing: {
    professor: {
      badge: 'Sobre o Professor',
      title: 'Conheca o Pedro',
      subtitle: 'Professor nativo com anos de experiencia',
      bio: 'Pedro ensina portugues ha mais de 5 anos.',
      credentials: {
        international: 'Experiencia internacional',
        method: 'Metodo proprio',
        live: 'Aulas ao vivo',
        feedback: 'Feedback continuo',
      },
    },
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <ProfessorSection />
    </NextIntlClientProvider>
  );
}

describe('ProfessorSection', () => {
  it('renderiza titulo e subtitulo i18n', () => {
    renderWithI18n();

    expect(screen.getByText('Conheca o Pedro')).toBeInTheDocument();
    expect(screen.getByText('Professor nativo com anos de experiencia')).toBeInTheDocument();
  });

  it('renderiza badge do professor', () => {
    renderWithI18n();

    expect(screen.getByText('Sobre o Professor')).toBeInTheDocument();
  });

  it('renderiza biografia do professor', () => {
    renderWithI18n();

    expect(screen.getByText('Pedro ensina portugues ha mais de 5 anos.')).toBeInTheDocument();
  });

  it('renderiza todas as 4 credenciais', () => {
    renderWithI18n();

    expect(screen.getByText('Experiencia internacional')).toBeInTheDocument();
    expect(screen.getByText('Metodo proprio')).toBeInTheDocument();
    expect(screen.getByText('Aulas ao vivo')).toBeInTheDocument();
    expect(screen.getByText('Feedback continuo')).toBeInTheDocument();
  });

  it('credenciais estao dentro de uma lista com aria-label', () => {
    renderWithI18n();

    const list = screen.getByRole('list', { name: 'Credenciais do professor' });
    expect(list).toBeInTheDocument();
    expect(list.querySelectorAll('li')).toHaveLength(4);
  });

  it('possui aria-labelledby apontando para heading', () => {
    renderWithI18n();

    const heading = screen.getByRole('heading', { name: 'Conheca o Pedro' });
    expect(heading).toHaveAttribute('id', 'professor-heading');
  });
});
