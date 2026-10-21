import { describe, expect, it } from 'vitest';

import { buildEbookCheckoutUrls } from '@/lib/ebooks/checkout-urls';

describe('buildEbookCheckoutUrls', () => {
  it('usa appUrl sem barra final como base', () => {
    const urls = buildEbookCheckoutUrls('meu-ebook', 'https://app.exemplo.com');

    expect(urls.successUrl).toBe(
      'https://app.exemplo.com/ebooks/meu-ebook/sucesso?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(urls.cancelUrl).toBe('https://app.exemplo.com/ebooks/meu-ebook');
  });

  it('remove uma barra final de appUrl', () => {
    const urls = buildEbookCheckoutUrls('meu-ebook', 'https://app.exemplo.com/');

    expect(urls.successUrl).toBe(
      'https://app.exemplo.com/ebooks/meu-ebook/sucesso?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(urls.cancelUrl).toBe('https://app.exemplo.com/ebooks/meu-ebook');
  });

  it('remove varias barras finais de appUrl', () => {
    const urls = buildEbookCheckoutUrls('meu-ebook', 'https://app.exemplo.com///');

    expect(urls.successUrl).toBe(
      'https://app.exemplo.com/ebooks/meu-ebook/sucesso?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(urls.cancelUrl).toBe('https://app.exemplo.com/ebooks/meu-ebook');
  });

  it('mantem o placeholder {CHECKOUT_SESSION_ID} literal no successUrl', () => {
    const { successUrl } = buildEbookCheckoutUrls('meu-ebook', 'https://app.exemplo.com');

    expect(successUrl).toContain('session_id={CHECKOUT_SESSION_ID}');
    expect(successUrl).not.toContain('%7B');
    expect(successUrl).not.toContain('%7D');
  });

  it('aplica encodeURIComponent ao slug com espaco', () => {
    const urls = buildEbookCheckoutUrls('ebook com espaco', 'https://app.exemplo.com');

    expect(urls.successUrl).toBe(
      'https://app.exemplo.com/ebooks/ebook%20com%20espaco/sucesso?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(urls.cancelUrl).toBe('https://app.exemplo.com/ebooks/ebook%20com%20espaco');
  });

  it('codifica caractere reservado de caminho no slug', () => {
    const urls = buildEbookCheckoutUrls('pasta/ebook', 'https://app.exemplo.com');

    expect(urls.successUrl).toBe(
      'https://app.exemplo.com/ebooks/pasta%2Febook/sucesso?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(urls.cancelUrl).toBe('https://app.exemplo.com/ebooks/pasta%2Febook');
  });

  it('mantem o hifen do slug sem codificacao', () => {
    const urls = buildEbookCheckoutUrls('meu-ebook-2', 'https://app.exemplo.com');

    expect(urls.successUrl).toBe(
      'https://app.exemplo.com/ebooks/meu-ebook-2/sucesso?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(urls.cancelUrl).toBe('https://app.exemplo.com/ebooks/meu-ebook-2');
  });

  it('cancelUrl aponta para a pagina do ebook sem query e successUrl para a pagina de sucesso', () => {
    const urls = buildEbookCheckoutUrls('meu-ebook', 'https://app.exemplo.com');

    expect(urls.cancelUrl).not.toContain('?');
    expect(urls.successUrl.startsWith('https://app.exemplo.com/ebooks/meu-ebook/sucesso?')).toBe(true);
  });
});
