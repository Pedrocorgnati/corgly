import { afterEach, describe, expect, it, vi } from 'vitest';

// Em vitest nao ha loader de imagem do Next: o import estatico vira string de
// URL e `cover.src` seria undefined. O mock traz um StaticImageData completo de
// proposito: prova que o mapeamento estrito descarta blur*.
vi.mock('../../../../content/ebooks/_e2e-fixture/sales/cover.webp', () => ({
  default: {
    src: '/_next/static/media/cover.e2e.webp',
    width: 600,
    height: 900,
    blurDataURL: 'data:image/webp;base64,AAAA',
    blurWidth: 5,
    blurHeight: 8,
  },
}));

// No vitest nao ha loader de imagem do Next: o import estatico de webp vira
// string de URL, entao o mock traz um StaticImageData para o catalogo real.
vi.mock('../../../../content/ebooks/brazilian-portuguese-for-english-speakers/sales/cover.webp', () => ({
  default: { src: '/_next/static/media/cover.bp-en.webp', width: 800, height: 1200 },
}));

const FIXTURE_SLUG = 'e2e-fixture-ebook';

type RegistryModule = typeof import('../../../../content/ebooks/index');
type RegistryEntry = RegistryModule['ebookRegistry'][number];

// Cada caso troca o env e reimporta o registro do zero (padrao de reset de modulo do loop).
async function loadRegistry(flag: string, nodeEnv: string): Promise<RegistryModule['ebookRegistry']> {
  vi.stubEnv('EBOOKS_E2E_FIXTURE', flag);
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.resetModules();
  const { ebookRegistry } = await import('../../../../content/ebooks/index');
  return ebookRegistry;
}

function fixtureEntries(registry: readonly RegistryEntry[]): RegistryEntry[] {
  return registry.filter((entry) => entry.slug === FIXTURE_SLUG);
}

describe('fixture e2e no registro do catalogo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sem a flag a fixture nao entra no registro', async () => {
    const registry = await loadRegistry('', 'test');

    expect(fixtureEntries(registry)).toHaveLength(0);
  });

  it('flag ativa com NODE_ENV production nao entra no registro', async () => {
    const registry = await loadRegistry('1', 'production');

    expect(fixtureEntries(registry)).toHaveLength(0);
  });

  it('flag ativa em teste entra uma vez e o catalogo parseia sem erro', async () => {
    const registry = await loadRegistry('1', 'test');
    expect(fixtureEntries(registry)).toHaveLength(1);

    // O catalog faz parse eager do registro no import: importar com a flag ativa
    // ja prova que o boot nao quebra.
    const catalogModule = await import('@/lib/ebooks/catalog');
    const catalog = catalogModule.parseEbookCatalog(registry);
    expect(fixtureEntries(catalog)).toHaveLength(1);

    const entry = catalog.find((e) => e.slug === FIXTURE_SLUG);
    expect(entry?.slug).toBe(FIXTURE_SLUG);
    expect(entry?.locale).toBe('en');
    expect(entry?.unitAmount).toBe(1990);
    expect(entry?.currency).toBe('usd');
    expect(entry?.images.cover).toEqual({
      src: '/_next/static/media/cover.e2e.webp',
      width: 600,
      height: 900,
      alt: expect.any(String),
    });
    expect(entry?.images.cover.alt.length ?? 0).toBeGreaterThan(0);
    expect(catalogModule.getEbookBySlug(FIXTURE_SLUG)?.slug).toBe(FIXTURE_SLUG);
  });

  it('flag ativa com NODE_ENV development entra no registro', async () => {
    const registry = await loadRegistry('1', 'development');

    expect(fixtureEntries(registry)).toHaveLength(1);
  });
});
