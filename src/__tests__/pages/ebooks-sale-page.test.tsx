import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { regressionEntry } from '../components/ebooks/_entry';

const mocks = vi.hoisted(() => ({
  getEbookBySlug: vi.fn(),
  listEbooks: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/ebooks', () => ({
  getEbookBySlug: mocks.getEbookBySlug,
  listEbooks: mocks.listEbooks,
}));

import EbooksCatalogPage from '@/app/(public)/ebooks/page';
import EbookDetailPage, {
  generateMetadata,
  generateStaticParams,
} from '@/app/(public)/ebooks/[slug]/page';
import EbookSegmentNotFound from '@/app/(public)/ebooks/[slug]/not-found';

const slug = regressionEntry.slug;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEbookBySlug.mockImplementation((s: string) => (s === slug ? regressionEntry : undefined));
  mocks.listEbooks.mockReturnValue([regressionEntry]);
});

describe('pagina do catalogo', () => {
  it('lista os ebooks do registro', async () => {
    render(<>{await EbooksCatalogPage()}</>);
    expect(screen.getByTestId('page-ebooks-catalog')).toBeTruthy();
    expect(screen.getByTestId(`ebook-catalog-card-${slug}`)).toBeTruthy();
  });

  it('mostra o estado vazio sem ebooks', async () => {
    mocks.listEbooks.mockReturnValue([]);
    render(<>{await EbooksCatalogPage()}</>);
    expect(screen.getByTestId('ebook-catalog-empty')).toBeTruthy();
  });
});

describe('pagina de venda', () => {
  it('renderiza a pagina do ebook no idioma da entrada', async () => {
    const ui = await EbookDetailPage({ params: Promise.resolve({ slug }) });
    render(<>{ui}</>);
    expect(screen.getByTestId('ebook-sales-page').getAttribute('lang')).toBe(regressionEntry.locale);
    expect(screen.getByTestId('ebook-buy-button')).toBeTruthy();
  });

  it('a capa usa o alt da entrada', async () => {
    const ui = await EbookDetailPage({ params: Promise.resolve({ slug }) });
    render(<>{ui}</>);
    expect(screen.getByAltText(regressionEntry.images.cover.alt)).toBeTruthy();
  });

  it.each([['acesso'], ['inexistente']])('slug "%s" vira not found', async (s) => {
    await expect(EbookDetailPage({ params: Promise.resolve({ slug: s }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('generateStaticParams devolve os slugs do catalogo', () => {
    expect(generateStaticParams()).toEqual([{ slug }]);
  });
});

describe('generateMetadata da pagina de venda', () => {
  it('monta title, description, canonical e openGraph a partir de copy.seo e da capa', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
    const { seo } = regressionEntry.copy;
    const { cover } = regressionEntry.images;

    expect(metadata.title).toBe(seo.title);
    expect(metadata.description).toBe(seo.description);
    expect(metadata.alternates?.canonical).toBe(`/ebooks/${slug}`);
    expect(metadata.openGraph).toMatchObject({
      title: seo.title,
      description: seo.description,
      url: `/ebooks/${slug}`,
      images: [{ url: cover.src, width: cover.width, height: cover.height, alt: cover.alt }],
    });
  });

  it.each([['acesso'], ['inexistente']])('slug "%s" nao gera metadata', async (s) => {
    expect(await generateMetadata({ params: Promise.resolve({ slug: s }) })).toEqual({});
  });
});

describe('not-found do segmento', () => {
  it('oferece links para o catalogo e a home', async () => {
    render(<>{await EbookSegmentNotFound()}</>);
    expect(screen.getByTestId('ebooks-not-found-catalog-link').getAttribute('href')).toBe('/ebooks');
    expect(screen.getByTestId('ebooks-not-found-home-link').getAttribute('href')).toBe('/');
  });
});
