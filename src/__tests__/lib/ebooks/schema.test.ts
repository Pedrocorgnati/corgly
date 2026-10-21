import { describe, expect, it } from 'vitest';

import { EBOOK_RESERVED_SLUGS, ebookCatalogEntrySchema } from '@/lib/ebooks/schema';

import { makeEbookInput, regressionEbookInput } from '../../fixtures/ebooks/regression-ebook';

type Mutable = Record<string, unknown>;

function clone(): Mutable {
  return structuredClone(regressionEbookInput) as unknown as Mutable;
}

function at(obj: Mutable, path: readonly (string | number)[]): Mutable {
  return path.reduce<Mutable>((acc, key) => acc[key] as Mutable, obj);
}

function withField(path: readonly (string | number)[], value: unknown): Mutable {
  const input = clone();
  const parent = at(input, path.slice(0, -1));
  parent[path[path.length - 1] as string] = value;
  return input;
}

function withoutField(path: readonly (string | number)[]): Mutable {
  const input = clone();
  const parent = at(input, path.slice(0, -1));
  delete parent[path[path.length - 1] as string];
  return input;
}

function parses(input: unknown): boolean {
  return ebookCatalogEntrySchema.safeParse(input).success;
}

const REQUIRED_FIELDS: readonly (readonly string[])[] = [
  ['slug'],
  ['title'],
  ['audience'],
  ['locale'],
  ['unitAmount'],
  ['currency'],
  ['stripePriceEnv'],
  ['stripePriceEnv', 'test'],
  ['stripePriceEnv', 'live'],
  ['pdfFile'],
  ['images'],
  ['images', 'cover'],
  ['images', 'cover', 'src'],
  ['images', 'cover', 'width'],
  ['images', 'cover', 'height'],
  ['images', 'cover', 'alt'],
  ['copy'],
  ['copy', 'title'],
  ['copy', 'promise'],
  ['copy', 'summary'],
  ['copy', 'faq'],
  ['copy', 'seo'],
  ['copy', 'seo', 'title'],
  ['copy', 'seo', 'description'],
  ['copy', 'emails'],
  ['copy', 'emails', 'deliverySubject'],
  ['copy', 'emails', 'deliveryBody'],
  ['copy', 'emails', 'recoverySubject'],
  ['copy', 'emails', 'recoveryBody'],
  ['copy', 'emails', 'accessLinkLabel'],
  ['copy', 'emails', 'withdrawalLinkLabel'],
  ['copy', 'emails', 'waiverNotice'],
  ['copy', 'emails', 'asyncFailedSubject'],
  ['copy', 'emails', 'asyncFailedBody'],
  ['copy', 'emails', 'retryLinkLabel'],
  ['copy', 'emails', 'refundFullSubject'],
  ['copy', 'emails', 'refundFullBody'],
  ['copy', 'emails', 'refundPartialSubject'],
  ['copy', 'emails', 'refundPartialBody'],
  ['copy', 'withdrawal'],
  ['copy', 'withdrawal', 'title'],
  ['copy', 'withdrawal', 'body'],
  ['copy', 'withdrawal', 'confirmLabel'],
  ['copy', 'withdrawal', 'acceptedBody'],
  ['copy', 'withdrawal', 'reviewBody'],
  ['copy', 'withdrawal', 'expiredBody'],
  ['copy', 'withdrawal', 'errorBody'],
  ['copy', 'errors'],
  ['copy', 'errors', 'checkoutUnavailable'],
  ['copy', 'errors', 'checkoutFailed'],
  ['copy', 'errors', 'accessInvalid'],
  ['copy', 'errors', 'accessRevoked'],
  ['copy', 'errors', 'pdfUnavailable'],
  ['copy', 'errors', 'accessRateLimited'],
];

const TEXT_FIELDS: readonly (readonly (string | number)[])[] = [
  ['title'],
  ['audience'],
  ['images', 'cover', 'src'],
  ['images', 'cover', 'alt'],
  ['copy', 'title'],
  ['copy', 'promise'],
  ['copy', 'summary', 0],
  ['copy', 'faq', 0, 'question'],
  ['copy', 'faq', 0, 'answer'],
  ['copy', 'seo', 'title'],
  ['copy', 'seo', 'description'],
  ['copy', 'emails', 'deliverySubject'],
  ['copy', 'emails', 'deliveryBody'],
  ['copy', 'emails', 'recoverySubject'],
  ['copy', 'emails', 'recoveryBody'],
  ['copy', 'emails', 'accessLinkLabel'],
  ['copy', 'emails', 'withdrawalLinkLabel'],
  ['copy', 'emails', 'waiverNotice'],
  ['copy', 'emails', 'asyncFailedSubject'],
  ['copy', 'emails', 'asyncFailedBody'],
  ['copy', 'emails', 'retryLinkLabel'],
  ['copy', 'emails', 'refundFullSubject'],
  ['copy', 'emails', 'refundFullBody'],
  ['copy', 'emails', 'refundPartialSubject'],
  ['copy', 'emails', 'refundPartialBody'],
  ['copy', 'withdrawal', 'title'],
  ['copy', 'withdrawal', 'body'],
  ['copy', 'withdrawal', 'confirmLabel'],
  ['copy', 'withdrawal', 'acceptedBody'],
  ['copy', 'withdrawal', 'reviewBody'],
  ['copy', 'withdrawal', 'expiredBody'],
  ['copy', 'withdrawal', 'errorBody'],
  ['copy', 'errors', 'checkoutUnavailable'],
  ['copy', 'errors', 'checkoutFailed'],
  ['copy', 'errors', 'accessInvalid'],
  ['copy', 'errors', 'accessRevoked'],
  ['copy', 'errors', 'pdfUnavailable'],
  ['copy', 'errors', 'accessRateLimited'],
];

describe('ebookCatalogEntrySchema', () => {
  it('aceita a fixture de regressao', () => {
    expect(parses(regressionEbookInput)).toBe(true);
  });

  it.each(REQUIRED_FIELDS.map((path) => [path.join('.'), path] as const))(
    'reprova quando o campo obrigatorio %s esta ausente',
    (_label, path) => {
      expect(parses(withoutField(path))).toBe(false);
    },
  );

  describe('chave desconhecida reprova em qualquer nivel', () => {
    it('no topo', () => {
      expect(parses({ ...clone(), extra: 1 })).toBe(false);
    });

    it.each([
      ['copy', ['copy']],
      ['images', ['images']],
      ['images.cover', ['images', 'cover']],
      ['stripePriceEnv', ['stripePriceEnv']],
      ['copy.seo', ['copy', 'seo']],
      ['copy.emails', ['copy', 'emails']],
      ['copy.withdrawal', ['copy', 'withdrawal']],
      ['copy.errors', ['copy', 'errors']],
      ['copy.faq[0]', ['copy', 'faq', 0]],
    ] as const)('em %s', (_label, path) => {
      const input = clone();
      at(input, path).extra = 'x';
      expect(parses(input)).toBe(false);
    });

    it('em item de gallery', () => {
      const input = clone();
      (input.images as Mutable).gallery = [
        { src: '/_test/g.webp', width: 10, height: 10, alt: 'g', extra: 'x' },
      ];
      expect(parses(input)).toBe(false);
    });
  });

  it.each(['Foo', 'a b', '-x', 'x-', '', 'a'.repeat(65)])('reprova slug invalido %j', (slug) => {
    expect(parses(withField(['slug'], slug))).toBe(false);
  });

  it('aceita slug com 64 caracteres', () => {
    expect(parses(withField(['slug'], 'a'.repeat(64)))).toBe(true);
  });

  it.each(EBOOK_RESERVED_SLUGS)('reprova slug reservado %j', (slug) => {
    expect(parses(withField(['slug'], slug))).toBe(false);
  });

  it('reserva o slug acesso (rota do link de acesso)', () => {
    expect(EBOOK_RESERVED_SLUGS).toContain('acesso');
  });

  it.each(['../x.pdf', 'a/b.pdf', 'x.txt', 'x.pdf '])('reprova pdfFile invalido %j', (pdfFile) => {
    expect(parses(withField(['pdfFile'], pdfFile))).toBe(false);
  });

  it('reprova nome de env em minuscula', () => {
    expect(parses(withField(['stripePriceEnv', 'test'], 'stripe_price_x'))).toBe(false);
    expect(parses(withField(['stripePriceEnv', 'live'], 'stripe_price_x'))).toBe(false);
  });

  it('reprova stripePriceEnv.test igual a stripePriceEnv.live', () => {
    const result = ebookCatalogEntrySchema.safeParse(
      withField(['stripePriceEnv', 'live'], 'STRIPE_PRICE_EBOOK_REGRESSION_TEST'),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['stripePriceEnv', 'live']);
  });

  it.each([0, -1, 19.9])('reprova unitAmount %j', (unitAmount) => {
    expect(parses(withField(['unitAmount'], unitAmount))).toBe(false);
  });

  it('reprova currency diferente de usd', () => {
    expect(parses(withField(['currency'], 'eur'))).toBe(false);
  });

  it('reprova locale fora do enum', () => {
    expect(parses(withField(['locale'], 'pt'))).toBe(false);
  });

  it('aceita guarantee e aiNotice quando presentes', () => {
    expect(
      parses(makeEbookInput({ copy: { guarantee: 'Garantia ficticia', aiNotice: 'Aviso ficticio' } })),
    ).toBe(true);
  });

  it('aceita a ausencia de guarantee e aiNotice', () => {
    const input = clone();
    expect((input.copy as Mutable).guarantee).toBeUndefined();
    expect((input.copy as Mutable).aiNotice).toBeUndefined();
    expect(parses(input)).toBe(true);
  });

  it.each(['guarantee', 'aiNotice'])('reprova %s vazio quando presente', (field) => {
    expect(parses(withField(['copy', field], '   '))).toBe(false);
  });

  it('reprova summary e faq vazios', () => {
    expect(parses(withField(['copy', 'summary'], []))).toBe(false);
    expect(parses(withField(['copy', 'faq'], []))).toBe(false);
  });

  describe.each(TEXT_FIELDS.map((path) => [path.join('.'), path] as const))(
    'campo de texto %s',
    (_label, path) => {
      it.each(['', '   '])('reprova %j', (value) => {
        expect(parses(withField(path, value))).toBe(false);
      });
    },
  );

  it('makeEbookInput mescla objetos aninhados e substitui arrays', () => {
    const input = makeEbookInput({ copy: { summary: ['a', 'b'], seo: { title: 'Outro SEO' } } });
    expect(input.copy.summary).toEqual(['a', 'b']);
    expect(input.copy.seo).toEqual({ title: 'Outro SEO', description: 'Descricao SEO ficticia' });
    expect(input.copy.faq).toEqual(regressionEbookInput.copy.faq);
    expect(regressionEbookInput.copy.seo.title).toBe('SEO ficticio');
  });
});
