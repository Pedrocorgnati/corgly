// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  EBOOK_ACCESS_ERROR_HEADERS,
  EBOOK_NEUTRAL_ERROR_COPY,
  negotiateEbookErrorCopy,
  renderEbookAccessErrorPage,
} from '@/lib/ebooks/access-page';
import { EBOOK_CLIENT_IP_MAX_LENGTH, getEbookClientIp } from '@/lib/ebooks/client-ip';
import { ebookCatalogEntrySchema } from '@/lib/ebooks/schema';

import { makeEbookInput, regressionEbookInput } from '../../fixtures/ebooks/regression-ebook';

const enEntry = ebookCatalogEntrySchema.parse(regressionEbookInput);
const esEntry = ebookCatalogEntrySchema.parse(
  makeEbookInput({
    slug: 'regression-fixture-ebook-es',
    locale: 'es',
    copy: { errors: { accessInvalid: 'Acesso ficticio invalido es' } },
  }),
);
const itEntry = ebookCatalogEntrySchema.parse(
  makeEbookInput({
    slug: 'regression-fixture-ebook-it',
    locale: 'it',
    copy: { errors: { accessInvalid: 'Acesso ficticio invalido it' } },
  }),
);

describe('renderEbookAccessErrorPage', () => {
  it('aplica os 5 headers de D3 e o status pedido', () => {
    const res = renderEbookAccessErrorPage({ status: 404, locale: 'en', message: 'x' });

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(res.headers.get('retry-after')).toBeNull();
    expect(Object.keys(EBOOK_ACCESS_ERROR_HEADERS)).toHaveLength(5);
  });

  it('escreve lang, meta robots e escapa & < > " \' no texto e no lang', async () => {
    const res = renderEbookAccessErrorPage({
      status: 410,
      locale: 'es"><x',
      message: `<script>alert("a&b's")</script>`,
    });
    const html = await res.text();

    expect(html).toContain('<html lang="es&quot;&gt;&lt;x">');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('&lt;script&gt;alert(&quot;a&amp;b&#39;s&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('envia Retry-After so no 429, com o texto de accessRateLimited', async () => {
    const res = renderEbookAccessErrorPage({
      status: 429,
      locale: enEntry.locale,
      message: enEntry.copy.errors.accessRateLimited,
      retryAfterSeconds: 12.2,
    });

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('13');
    expect(await res.text()).toContain('Limite ficticio de acessos');
  });

  it('Retry-After tem minimo de 1 segundo', () => {
    const res = renderEbookAccessErrorPage({ status: 429, locale: 'en', message: 'x', retryAfterSeconds: 0 });
    expect(res.headers.get('retry-after')).toBe('1');
  });

  it('ignora retryAfterSeconds fora do 429', () => {
    const res = renderEbookAccessErrorPage({ status: 503, locale: 'en', message: 'x', retryAfterSeconds: 30 });
    expect(res.headers.get('retry-after')).toBeNull();
  });
});

describe('negotiateEbookErrorCopy', () => {
  const catalog = [enEntry, esEntry, itEntry];

  it('casa pelo subtag primario do Accept-Language', () => {
    const result = negotiateEbookErrorCopy({ acceptLanguage: 'es-AR,es;q=0.9', catalog });
    expect(result).toEqual({ locale: 'es', errors: esEntry.copy.errors });
  });

  it('respeita o peso q e descarta q=0', () => {
    expect(negotiateEbookErrorCopy({ acceptLanguage: 'es;q=0.2, it;q=0.8', catalog }).locale).toBe('it');
    expect(negotiateEbookErrorCopy({ acceptLanguage: 'it;q=0, es;q=0.1', catalog }).locale).toBe('es');
  });

  it('ignora idioma sem entrada e segue para o proximo', () => {
    expect(negotiateEbookErrorCopy({ acceptLanguage: 'fr-FR, it', catalog }).locale).toBe('it');
  });

  it.each([null, undefined, '', '*', 'fr', ';;,'])(
    'sem casamento (%j) usa a primeira entrada do catalogo',
    (acceptLanguage) => {
      expect(negotiateEbookErrorCopy({ acceptLanguage, catalog: [esEntry, itEntry] })).toEqual({
        locale: 'es',
        errors: esEntry.copy.errors,
      });
    },
  );

  it('catalogo vazio usa a copy neutra', () => {
    const result = negotiateEbookErrorCopy({ acceptLanguage: 'es', catalog: [] });
    expect(result.locale).toBe('en');
    expect(result.errors).toEqual(EBOOK_NEUTRAL_ERROR_COPY.errors);
    expect(Object.values(result.errors).every((text) => text.trim().length > 0)).toBe(true);
  });
});

describe('getEbookClientIp', () => {
  it('usa o primeiro valor de x-forwarded-for aparado', () => {
    const headers = new Headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1', 'x-real-ip': '198.51.100.2' });
    expect(getEbookClientIp(headers)).toBe('203.0.113.7');
  });

  it('cai para x-real-ip e depois para unknown', () => {
    expect(getEbookClientIp(new Headers({ 'x-real-ip': ' 198.51.100.2 ' }))).toBe('198.51.100.2');
    expect(getEbookClientIp(new Headers({ 'x-forwarded-for': ' , 10.0.0.1' }))).toBe('unknown');
    expect(getEbookClientIp(new Headers())).toBe('unknown');
  });

  it('trunca a 45 caracteres', () => {
    const long = 'a'.repeat(80);
    const ip = getEbookClientIp(new Headers({ 'x-forwarded-for': long }));
    expect(EBOOK_CLIENT_IP_MAX_LENGTH).toBe(45);
    expect(ip).toBe('a'.repeat(45));
  });
});
