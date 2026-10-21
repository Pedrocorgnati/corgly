import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EbookAiNotice } from '@/components/ebooks/ebook-ai-notice';
import { EbookFaq } from '@/components/ebooks/ebook-faq';
import { EbookGuarantee } from '@/components/ebooks/ebook-guarantee';
import { EbookPrice, formatEbookPrice } from '@/components/ebooks/ebook-price';

import { regressionEntry } from './_entry';

describe('EbookFaq', () => {
  const items = [
    { question: 'P1?', answer: 'R1' },
    { question: 'P2?', answer: 'R2' },
  ];

  it('renderiza itens e abre so o primeiro', () => {
    render(<EbookFaq items={items} title="Duvidas" />);
    expect(screen.getByTestId('ebook-faq').textContent).toContain('Duvidas');
    expect(screen.getByTestId('ebook-faq-item-0').hasAttribute('open')).toBe(true);
    expect(screen.getByTestId('ebook-faq-item-1').hasAttribute('open')).toBe(false);
    expect(screen.getByTestId('ebook-faq-item-1-trigger').textContent).toBe('P2?');
  });

  it('nao renderiza nada sem itens', () => {
    const { container } = render(<EbookFaq items={[]} title="Duvidas" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('EbookGuarantee e EbookAiNotice', () => {
  it('mostram o texto quando existe', () => {
    render(
      <>
        <EbookGuarantee text="Garantia X" />
        <EbookAiNotice text="Aviso Y" />
      </>,
    );
    expect(screen.getByTestId('ebook-guarantee').textContent).toBe('Garantia X');
    expect(screen.getByTestId('ebook-ai-notice').textContent).toBe('Aviso Y');
  });

  it('somem sem texto', () => {
    const { container } = render(
      <>
        <EbookGuarantee />
        <EbookAiNotice text="" />
      </>,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('EbookPrice', () => {
  it('formata o valor em moeda a partir de centavos', () => {
    const text = formatEbookPrice(regressionEntry);
    expect(text).toContain('19.90');
    expect(text).toContain('$');
  });

  it('mostra rotulo e valor', () => {
    render(<EbookPrice entry={regressionEntry} label="Preco" />);
    expect(screen.getByTestId('ebook-price').textContent).toContain('Preco');
    expect(screen.getByTestId('ebook-price-value').textContent).toBe(formatEbookPrice(regressionEntry));
  });
});
