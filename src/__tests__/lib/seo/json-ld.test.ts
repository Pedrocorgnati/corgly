import { describe, it, expect } from 'vitest';
import {
  buildPersonSchema,
  buildWebSiteSchema,
  buildCourseSchema,
  buildOrganizationSchema,
  buildFaqSchema,
  buildLandingPageSchemas,
  LANDING_FAQ_SCHEMA,
} from '@/lib/seo/json-ld';
import { FIRST_LESSON_USD, SINGLE_USD } from '@/lib/constants/landing';
import { defaultLocale } from '../../../../i18n/config';
import en from '../../../../i18n/messages/en-US.json';

/**
 * Percorre o schema recursivamente e devolve os caminhos com valor vazio
 * (string em branco, array sem item, objeto sem chave). JSON-LD com campo vazio
 * e rejeitado pelo Rich Results e vira ruido no HTML servido.
 */
function emptyPaths(node: unknown, path = '$'): string[] {
  if (typeof node === 'string') return node.trim() === '' ? [path] : [];
  if (Array.isArray(node)) {
    if (node.length === 0) return [path];
    return node.flatMap((item, idx) => emptyPaths(item, `${path}[${idx}]`));
  }
  if (node && typeof node === 'object') {
    const entries = Object.entries(node as Record<string, unknown>);
    if (entries.length === 0) return [path];
    return entries.flatMap(([key, value]) => emptyPaths(value, `${path}.${key}`));
  }
  if (node === null || node === undefined) return [path];
  return [];
}

describe('buildPersonSchema', () => {
  it('retorna schema Person com dados corretos', () => {
    const schema = buildPersonSchema();

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Person');
    expect(schema.name).toBe('Pedro');
    expect(schema.jobTitle).toBe('Native Brazilian Portuguese teacher');
  });

  /**
   * DEFESA: a copy do JSON-LD segue o locale default do produto, nao o idioma
   * do professor. A landing e servida na mesma URL nos quatro idiomas e o
   * schema e montado no modulo do server component (`src/app/(public)/page.tsx`),
   * sem acesso a cookie/JWT: o rastreador recebe sempre o default. Se
   * `defaultLocale` deixar de ser 'en-US', esta copy tem de ser traduzida junto.
   */
  it('mantem a copy no locale default do produto', () => {
    expect(defaultLocale).toBe('en-US');
    expect(buildPersonSchema().jobTitle).toBe('Native Brazilian Portuguese teacher');
  });

  it('inclui nacionalidade brasileira', () => {
    const schema = buildPersonSchema();

    expect(schema.nationality).toEqual({ '@type': 'Country', name: 'Brazil' });
  });

  it('inclui knowsAbout com topicos relevantes', () => {
    const schema = buildPersonSchema();

    expect(schema.knowsAbout).toContain('Brazilian Portuguese');
    expect(schema.knowsAbout).toContain('Language Learning');
  });
});

describe('buildWebSiteSchema', () => {
  it('retorna schema WebSite com dados corretos', () => {
    const schema = buildWebSiteSchema();

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('WebSite');
    expect(schema.name).toBe('Corgly');
  });

  /**
   * DEFESA: nada de SearchAction enquanto nao existir pagina de resultados
   * indexavel. `/content` e `robots: { index: false }` e filtra categoria no
   * cliente, sem ler `?q=` (`src/app/(public)/content/page.tsx`). Declarar a
   * acao mandaria o Google para uma busca inexistente.
   */
  it('nao declara potentialAction enquanto nao existe pagina de busca indexavel', () => {
    const schema = buildWebSiteSchema();

    expect('potentialAction' in schema).toBe(false);
  });
});

describe('buildCourseSchema', () => {
  it('retorna schema Course com dados corretos', () => {
    const schema = buildCourseSchema();

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Course');
    expect(schema.name).toContain('Corgly Method');
    expect(schema.courseMode).toBe('online');
  });

  it('inclui provider como Person (Pedro)', () => {
    const schema = buildCourseSchema();

    expect(schema.provider['@type']).toBe('Person');
    expect(schema.provider.name).toBe('Pedro');
  });

  /**
   * DEFESA: a Offer publica o preco INCONDICIONAL da aula avulsa. O valor de
   * primeira aula (`FIRST_LESSON_USD`) so vale quando `isFirstPurchase` e
   * verdadeiro; a SERP e mostrada a todo mundo, entao anuncia-lo aqui seria
   * preco falso para quem ja comprou.
   */
  it('inclui oferta com o preco incondicional em USD, nao o promocional', () => {
    const schema = buildCourseSchema();

    expect(schema.offers['@type']).toBe('Offer');
    expect(schema.offers.price).toBe('25');
    expect(schema.offers.price).toBe(String(SINGLE_USD));
    expect(schema.offers.price).not.toBe(String(FIRST_LESSON_USD));
    expect(schema.offers.priceCurrency).toBe('USD');
    expect(schema.offers.availability).toBe('https://schema.org/InStock');
  });

  it('descreve a promo de primeira aula qualificada por aluno novo', () => {
    const schema = buildCourseSchema();

    expect(schema.description).toContain('US$ 12.50');
    expect(schema.description).toMatch(/once per new student/i);
  });

  it('suporta multiplos idiomas', () => {
    const schema = buildCourseSchema();

    expect(schema.inLanguage).toContain('pt-BR');
    expect(schema.inLanguage).toContain('en');
    expect(schema.inLanguage).toContain('es');
    expect(schema.inLanguage).toContain('it');
  });
});

describe('LANDING_FAQ_SCHEMA', () => {
  /**
   * DEFESA: o FAQPage tem de repetir, palavra por palavra e na mesma ordem, o
   * FAQ que o visitante ve (`landing.faq.items` do catalogo en-US, renderizado
   * por `src/components/landing/faq-section.tsx`). Divergir e structured data
   * enganosa e derruba o rich result.
   */
  it('espelha o FAQ visivel da landing (catalogo en-US) na mesma ordem', () => {
    const visivel = Object.values(en.landing.faq.items).map((item) => ({
      question: item.q,
      answer: item.a,
    }));

    expect(LANDING_FAQ_SCHEMA).toEqual(visivel);
  });

  it('vira FAQPage com uma Question por item', () => {
    const schema = buildFaqSchema(LANDING_FAQ_SCHEMA);

    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toHaveLength(LANDING_FAQ_SCHEMA.length);
    expect(schema.mainEntity[0]['@type']).toBe('Question');
    expect(schema.mainEntity[0].acceptedAnswer.text).toBe(LANDING_FAQ_SCHEMA[0].answer);
  });
});

describe('buildOrganizationSchema', () => {
  it('retorna schema Organization com contato e fundador', () => {
    const schema = buildOrganizationSchema();

    expect(schema['@type']).toBe('Organization');
    expect(schema.name).toBe('Corgly');
    expect(schema.founder['@type']).toBe('Person');
    expect(schema.contactPoint.availableLanguage).toHaveLength(4);
  });
});

describe('buildLandingPageSchemas', () => {
  /**
   * DEFESA: asserir por `@type`, nunca por indice. A versao anterior deste
   * teste fixava tamanho 3 e lia `schemas[i]` posicionalmente; quando a landing
   * ganhou Organization e FAQPage, quebrou por posicao em vez de apontar o que
   * faltava.
   */
  it('publica exatamente os cinco tipos da landing, sem repetir', () => {
    const types = buildLandingPageSchemas().map((schema) => schema['@type']);

    expect([...types].sort()).toEqual(
      ['Course', 'FAQPage', 'Organization', 'Person', 'WebSite'],
    );
    expect(new Set(types).size).toBe(types.length);
  });

  it('todo schema publicado e valido e nenhum campo vem vazio', () => {
    const schemas = buildLandingPageSchemas();

    for (const schema of schemas) {
      expect(schema['@context']).toBe('https://schema.org');
      expect(emptyPaths(schema, `$(${schema['@type']})`)).toEqual([]);
    }
  });
});
