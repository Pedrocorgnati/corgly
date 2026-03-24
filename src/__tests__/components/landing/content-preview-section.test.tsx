import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ContentPreviewSection } from '@/components/landing/content-preview-section';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const messages = {
  landing: {
    content_preview: {
      badge: 'Conteudo',
      title: 'Explore o Conteudo',
      subtitle: 'Materiais exclusivos para o seu aprendizado',
      cta: 'Ver Conteudo',
    },
  },
};

function renderWithI18n() {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      <ContentPreviewSection />
    </NextIntlClientProvider>
  );
}

describe('ContentPreviewSection', () => {
  it('renderiza titulo e subtitulo i18n', () => {
    renderWithI18n();

    expect(screen.getByText('Explore o Conteudo')).toBeInTheDocument();
    expect(screen.getByText('Materiais exclusivos para o seu aprendizado')).toBeInTheDocument();
  });

  it('renderiza badge', () => {
    renderWithI18n();

    expect(screen.getByText('Conteudo')).toBeInTheDocument();
  });

  it('renderiza botao CTA', () => {
    renderWithI18n();

    expect(screen.getByText('Ver Conteudo')).toBeInTheDocument();
  });

  it('CTA aponta para /content', () => {
    renderWithI18n();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/content');
  });

  it('possui aria-labelledby apontando para heading', () => {
    renderWithI18n();

    const heading = screen.getByRole('heading', { name: 'Explore o Conteudo' });
    expect(heading).toHaveAttribute('id', 'content-heading');
  });
});
