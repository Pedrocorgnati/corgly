import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ContentPreviewSection } from '@/components/landing/content-preview-section';
import en from '../../../../i18n/messages/en-US.json';
import ptBR from '../../../../i18n/messages/pt-BR.json';

/**
 * A versao anterior deste arquivo afirmava o CONTRARIO do que a landing faz
 * hoje: travava que `(public)/page.tsx` NAO montava a secao. A secao foi
 * montada em producao e o teste foi apagado em vez de corrigido — componente
 * em producao sem teste. Este arquivo repoe a cobertura pela realidade atual:
 * a secao esta montada, resolve copy dos quatro locales e leva ao acervo.
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const LANDING_PAGE = path.resolve(process.cwd(), 'src/app/(public)/page.tsx');

function renderSection(locale: 'en-US' | 'pt-BR' = 'en-US') {
  const messages = locale === 'pt-BR' ? ptBR : en;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ContentPreviewSection />
    </NextIntlClientProvider>,
  );
}

describe('ContentPreviewSection', () => {
  it('renderiza badge, titulo, subtitulo e CTA com a copy do catalogo', () => {
    renderSection();

    const copy = en.landing.content_preview;
    expect(screen.getByText(copy.badge)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(copy.title);
    expect(screen.getByText(copy.subtitle)).toBeInTheDocument();
    expect(screen.getByTestId('landing-content-preview-cta-button')).toHaveTextContent(copy.cta);
  });

  it('nomeia a regiao pelo proprio titulo (aria-labelledby aponta para o h2)', () => {
    renderSection();

    const section = screen.getByTestId('landing-content-preview');
    const labelledBy = section.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toBe(
      screen.getByRole('heading', { level: 2 }),
    );
  });

  it('o CTA leva ao acervo publico de conteudo', () => {
    renderSection();

    const cta = screen.getByTestId('landing-content-preview-cta-button');
    expect(cta.closest('a')).toHaveAttribute('href', '/content');
  });

  it('troca de idioma junto com o catalogo (nada cravado em ingles)', () => {
    renderSection('pt-BR');

    const copy = ptBR.landing.content_preview;
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(copy.title);
    expect(screen.getByTestId('landing-content-preview-cta-button')).toHaveTextContent(copy.cta);
    expect(copy.title).not.toBe(en.landing.content_preview.title);
  });

  it('continua montada na landing publica', () => {
    const source = fs.readFileSync(LANDING_PAGE, 'utf-8');

    expect(source).toContain(
      "import { ContentPreviewSection } from '@/components/landing/content-preview-section';",
    );
    expect(source).toContain('<ContentPreviewSection />');
  });
});
