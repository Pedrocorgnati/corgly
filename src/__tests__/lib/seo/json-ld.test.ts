import { describe, it, expect } from 'vitest';
import {
  buildPersonSchema,
  buildWebSiteSchema,
  buildCourseSchema,
  buildLandingPageSchemas,
} from '@/lib/seo/json-ld';

describe('buildPersonSchema', () => {
  it('retorna schema Person com dados corretos', () => {
    const schema = buildPersonSchema();

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Person');
    expect(schema.name).toBe('Pedro Corgnati');
    expect(schema.jobTitle).toBe('Professor de Português Brasileiro');
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

  it('inclui potentialAction de busca', () => {
    const schema = buildWebSiteSchema();

    expect(schema.potentialAction['@type']).toBe('SearchAction');
    expect(schema.potentialAction.target.urlTemplate).toContain('/content?q=');
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
    expect(schema.provider.name).toBe('Pedro Corgnati');
  });

  it('inclui oferta com preco em USD', () => {
    const schema = buildCourseSchema();

    expect(schema.offers['@type']).toBe('Offer');
    expect(schema.offers.price).toBe('25');
    expect(schema.offers.priceCurrency).toBe('USD');
    expect(schema.offers.availability).toBe('https://schema.org/InStock');
  });

  it('suporta multiplos idiomas', () => {
    const schema = buildCourseSchema();

    expect(schema.inLanguage).toContain('pt-BR');
    expect(schema.inLanguage).toContain('en');
    expect(schema.inLanguage).toContain('es');
    expect(schema.inLanguage).toContain('it');
  });
});

describe('buildLandingPageSchemas', () => {
  it('retorna array com 3 schemas', () => {
    const schemas = buildLandingPageSchemas();

    expect(schemas).toHaveLength(3);
  });

  it('contém Person, WebSite e Course', () => {
    const schemas = buildLandingPageSchemas();
    const types = schemas.map((s) => s['@type']);

    expect(types).toContain('Person');
    expect(types).toContain('WebSite');
    expect(types).toContain('Course');
  });
});
