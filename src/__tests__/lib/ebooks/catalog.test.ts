import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getEbookBySlug,
  getEbookCatalog,
  listEbooks,
  parseEbookCatalog,
} from '@/lib/ebooks/catalog';
import { EbookCatalogError } from '@/lib/ebooks/errors';
import { AppError } from '@/lib/errors';

import { ebookRegistry } from '../../../../content/ebooks/index';
import { makeEbookInput, regressionEbookInput } from '../../fixtures/ebooks/regression-ebook';

// No vitest nao ha loader de imagem do Next: o import estatico de webp vira
// string de URL, entao o mock traz um StaticImageData para o catalogo real.
vi.mock('../../../../content/ebooks/brazilian-portuguese-for-english-speakers/sales/cover.webp', () => ({
  default: { src: '/_next/static/media/cover.bp-en.webp', width: 800, height: 1200 },
}));

const REGISTRY_MODULE = '../../../../content/ebooks/index';

function captureError(fn: () => unknown): EbookCatalogError {
  try {
    fn();
  } catch (err) {
    return err as EbookCatalogError;
  }
  throw new Error('esperava erro, nada foi lancado');
}

function second(slug: string) {
  return makeEbookInput({
    slug,
    pdfFile: `${slug}.pdf`,
    stripePriceEnv: { test: 'STRIPE_PRICE_EBOOK_SECOND_TEST', live: 'STRIPE_PRICE_EBOOK_SECOND_LIVE' },
  });
}

describe('parseEbookCatalog', () => {
  it('aceita catalogo vazio', () => {
    expect(parseEbookCatalog([])).toEqual([]);
  });

  it('devolve o catalogo congelado em profundidade', () => {
    const catalog = parseEbookCatalog([regressionEbookInput]);
    expect(catalog).toHaveLength(1);
    const [entry] = catalog;
    expect(entry?.slug).toBe('regression-fixture-ebook');
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry?.copy)).toBe(true);
    expect(Object.isFrozen(entry?.copy.seo)).toBe(true);
    expect(Object.isFrozen(entry?.copy.emails)).toBe(true);
    expect(Object.isFrozen(entry?.copy.errors)).toBe(true);
    expect(Object.isFrozen(entry?.copy.faq[0])).toBe(true);
    expect(Object.isFrozen(entry?.images.cover)).toBe(true);
  });

  it('aceita duas entradas distintas', () => {
    expect(parseEbookCatalog([regressionEbookInput, second('second-ebook')])).toHaveLength(2);
  });

  it('reprova slug duplicado', () => {
    const dup = makeEbookInput({
      pdfFile: 'other.pdf',
      stripePriceEnv: { test: 'STRIPE_PRICE_EBOOK_OTHER_TEST', live: 'STRIPE_PRICE_EBOOK_OTHER_LIVE' },
    });
    const err = captureError(() => parseEbookCatalog([regressionEbookInput, dup]));
    expect(err).toBeInstanceOf(EbookCatalogError);
    expect(err.message).toContain('regression-fixture-ebook');
    expect(err.message).toContain('slug');
  });

  it('reprova pdfFile duplicado', () => {
    const dup = makeEbookInput({
      slug: 'other-ebook',
      stripePriceEnv: { test: 'STRIPE_PRICE_EBOOK_OTHER_TEST', live: 'STRIPE_PRICE_EBOOK_OTHER_LIVE' },
    });
    const err = captureError(() => parseEbookCatalog([regressionEbookInput, dup]));
    expect(err).toBeInstanceOf(EbookCatalogError);
    expect(err.message).toContain('other-ebook');
    expect(err.message).toContain('pdfFile');
  });

  it('reprova nome de env de price duplicado', () => {
    const dup = makeEbookInput({ slug: 'other-ebook', pdfFile: 'other-ebook.pdf' });
    const err = captureError(() => parseEbookCatalog([regressionEbookInput, dup]));
    expect(err).toBeInstanceOf(EbookCatalogError);
    expect(err.message).toContain('other-ebook');
    expect(err.message).toContain('stripePriceEnv');
  });

  it('reprova o test de uma entrada igual ao live de outra (conflito cruzado)', () => {
    const cross = makeEbookInput({
      slug: 'cross-ebook',
      pdfFile: 'cross-ebook.pdf',
      stripePriceEnv: {
        test: 'STRIPE_PRICE_EBOOK_REGRESSION_LIVE',
        live: 'STRIPE_PRICE_EBOOK_CROSS_LIVE',
      },
    });
    const err = captureError(() => parseEbookCatalog([regressionEbookInput, cross]));
    expect(err).toBeInstanceOf(EbookCatalogError);
    expect(err.message).toContain('cross-ebook');
    expect(err.message).toContain('stripePriceEnv');
  });

  it('mensagem de entrada invalida traz indice, slug e path Zod', () => {
    const invalid = { ...structuredClone(second('x')), copy: { ...regressionEbookInput.copy, faq: [] } };
    const err = captureError(() => parseEbookCatalog([regressionEbookInput, invalid]));
    expect(err.message).toMatch(/^ebook\[1\] \(slug=x\): copy\.faq: /);
  });

  it('objeto vazio gera mensagem de uma linha com a primeira issue', () => {
    const err = captureError(() => parseEbookCatalog([{}]));
    expect(err.message).toMatch(/^ebook\[0\] \(slug=<sem slug>\): [^:]+: [^\n]+$/);
  });

  it('slug nao-string vira <sem slug>', () => {
    const err = captureError(() => parseEbookCatalog([{ ...structuredClone(regressionEbookInput), slug: 42 }]));
    expect(err.message).toMatch(/^ebook\[0\] \(slug=<sem slug>\): slug: /);
  });

  it('nunca ecoa o price ID literal na mensagem', () => {
    const leaked = makeEbookInput({
      stripePriceEnv: { test: 'price_1AbCdEfGhIjKlMnO', live: 'STRIPE_PRICE_EBOOK_REGRESSION_LIVE' },
    });
    const err = captureError(() => parseEbookCatalog([leaked]));
    expect(err).toBeInstanceOf(EbookCatalogError);
    expect(err.message).not.toContain('price_1AbCdEfGhIjKlMnO');
  });

  it('o erro e AppError com code EBOOK_CATALOG_INVALID e status 500', () => {
    const err = captureError(() => parseEbookCatalog([{}]));
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('EBOOK_CATALOG_INVALID');
    expect(err.status).toBe(500);
  });
});

describe('registro real de content/ebooks', () => {
  it('parseia sem erro e nao contem a fixture de regressao', () => {
    expect(() => parseEbookCatalog(ebookRegistry)).not.toThrow();
    expect(ebookRegistry.map((entry) => entry.slug)).not.toContain('regression-fixture-ebook');
  });

  it('getEbookBySlug devolve undefined para slug inexistente', () => {
    expect(getEbookBySlug('nao-existe')).toBeUndefined();
  });

  it('getEbookCatalog e listEbooks devolvem o mesmo array congelado', () => {
    expect(getEbookCatalog()).toBe(listEbooks());
    expect(Object.isFrozen(getEbookCatalog())).toBe(true);
  });
});

describe('carregamento do modulo com registro mockado', () => {
  afterEach(() => {
    vi.doUnmock(REGISTRY_MODULE);
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('expoe a entrada do registro valido', async () => {
    vi.doMock(REGISTRY_MODULE, () => ({ ebookRegistry: [regressionEbookInput] }));
    vi.resetModules();
    const mod = await import('@/lib/ebooks/catalog');
    const entry = mod.getEbookBySlug('regression-fixture-ebook');
    expect(entry?.slug).toBe('regression-fixture-ebook');
    expect(mod.getEbookCatalog()).toBe(mod.listEbooks());
    expect(mod.getEbookCatalog()).toHaveLength(1);
    expect(Object.isFrozen(mod.getEbookCatalog())).toBe(true);
  });

  it('lanca no load quando o registro e invalido (fail-loud de boot/build)', async () => {
    vi.doMock(REGISTRY_MODULE, () => ({ ebookRegistry: [{}] }));
    vi.resetModules();
    await expect(import('@/lib/ebooks/catalog')).rejects.toMatchObject({
      code: 'EBOOK_CATALOG_INVALID',
    });
  });
});
