import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EbookCatalogList } from '@/components/ebooks/ebook-catalog-list';

import { regressionEntry } from './_entry';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const labels = { viewEbook: 'Ver ebook', empty: 'Nenhum ebook', emptyCta: 'Voltar ao inicio' };

describe('EbookCatalogList', () => {
  it('renderiza um card por ebook com link para a pagina de venda', () => {
    render(<EbookCatalogList entries={[regressionEntry]} labels={labels} />);
    const slug = regressionEntry.slug;
    expect(screen.getByTestId('ebook-catalog-list')).toBeTruthy();
    const card = screen.getByTestId(`ebook-catalog-card-${slug}`);
    expect(card.getAttribute('lang')).toBe(regressionEntry.locale);
    expect(card.textContent).toContain(regressionEntry.copy.title);
    expect(card.textContent).toContain(regressionEntry.copy.promise);
    const link = screen.getByTestId(`ebook-catalog-card-link-${slug}`);
    expect(link.getAttribute('href')).toBe(`/ebooks/${slug}`);
    expect(link.textContent).toBe('Ver ebook');
    expect(screen.queryByTestId('ebook-catalog-empty')).toBeNull();
  });

  it('mostra estado vazio com link para a home', () => {
    render(<EbookCatalogList entries={[]} labels={labels} />);
    expect(screen.getByTestId('ebook-catalog-empty').textContent).toContain('Nenhum ebook');
    expect(screen.getByTestId('ebook-catalog-empty-home-link').getAttribute('href')).toBe('/');
    expect(screen.queryByTestId('ebook-catalog-list')).toBeNull();
  });
});
