import { describe, it, expect } from 'vitest';
import { generateLandingMetadata, generatePageMetadata } from '@/lib/seo/metadata';

describe('generateLandingMetadata', () => {
  it('retorna metadata para pt-BR com titulo correto', () => {
    const meta = generateLandingMetadata('pt-BR');

    expect(meta.title).toBe('Corgly — Aprenda Português Brasileiro com Professor Nativo');
    expect(meta.description).toContain('português brasileiro');
  });

  it('retorna metadata para en-US com titulo em ingles', () => {
    const meta = generateLandingMetadata('en-US');

    expect(meta.title).toBe('Corgly — Learn Brazilian Portuguese with a Native Teacher');
    expect(meta.description).toContain('Brazilian Portuguese');
  });

  it('retorna metadata para es-ES com titulo em espanhol', () => {
    const meta = generateLandingMetadata('es-ES');

    expect(meta.title).toContain('Portugués Brasileño');
  });

  it('retorna metadata para it-IT com titulo em italiano', () => {
    const meta = generateLandingMetadata('it-IT');

    expect(meta.title).toContain('Portoghese Brasiliano');
  });

  it('fallback para en-US com locale desconhecido', () => {
    const meta = generateLandingMetadata('fr-FR');

    expect(meta.title).toBe('Corgly — Learn Brazilian Portuguese with a Native Teacher');
  });

  it('fallback para en-US sem argumento', () => {
    const meta = generateLandingMetadata();

    expect(meta.title).toBe('Corgly — Learn Brazilian Portuguese with a Native Teacher');
  });

  it('inclui openGraph com dados corretos', () => {
    const meta = generateLandingMetadata('pt-BR');

    expect(meta.openGraph).toBeDefined();
    expect(meta.openGraph!.siteName).toBe('Corgly');
    expect(meta.openGraph!.type).toBe('website');
    expect(meta.openGraph!.locale).toBe('pt_BR');
  });

  it('inclui alternates com hreflang para todas as locales', () => {
    const meta = generateLandingMetadata('en-US');

    expect(meta.alternates).toBeDefined();
    expect(meta.alternates!.languages).toHaveProperty('pt-BR');
    expect(meta.alternates!.languages).toHaveProperty('en-US');
    expect(meta.alternates!.languages).toHaveProperty('es-ES');
    expect(meta.alternates!.languages).toHaveProperty('it-IT');
    expect(meta.alternates!.languages).toHaveProperty('x-default');
  });

  it('inclui twitter card', () => {
    const meta = generateLandingMetadata('en-US');

    expect(meta.twitter).toBeDefined();
    expect(meta.twitter!.card).toBe('summary_large_image');
  });

  it('robots permite indexacao', () => {
    const meta = generateLandingMetadata('en-US');

    expect(meta.robots).toEqual({ index: true, follow: true });
  });
});

describe('generatePageMetadata', () => {
  it('herda dados base da landing metadata', () => {
    const meta = generatePageMetadata('privacy', 'pt-BR');

    expect(meta.title).toBe('Corgly — Aprenda Português Brasileiro com Professor Nativo');
  });

  it('permite indexacao para paginas publicas (privacy, terms, content)', () => {
    const privacyMeta = generatePageMetadata('privacy');
    const termsMeta = generatePageMetadata('terms');
    const contentMeta = generatePageMetadata('content');

    expect(privacyMeta.robots).toEqual({ index: true, follow: true });
    expect(termsMeta.robots).toEqual({ index: true, follow: true });
    expect(contentMeta.robots).toEqual({ index: true, follow: true });
  });

  it('aplica noindex para not-found', () => {
    const meta = generatePageMetadata('not-found');

    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('aplica noindex para error', () => {
    const meta = generatePageMetadata('error');

    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
