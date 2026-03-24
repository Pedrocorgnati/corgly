import { describe, it, expect } from 'vitest';
import { detectLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/lib/detect-locale';

/** Helper to create a mock cookie store */
function mockCookieStore(cookies: Record<string, string> = {}) {
  return {
    get(name: string) {
      const value = cookies[name];
      return value ? { value } : undefined;
    },
  };
}

describe('detectLocale', () => {
  describe('prioridade 1: cookie', () => {
    it('retorna locale do cookie quando valido (pt-BR)', () => {
      const store = mockCookieStore({ corgly_locale: 'pt-BR' });
      expect(detectLocale(store)).toBe('pt-BR');
    });

    it('retorna locale do cookie quando valido (en-US)', () => {
      const store = mockCookieStore({ corgly_locale: 'en-US' });
      expect(detectLocale(store)).toBe('en-US');
    });

    it('retorna locale do cookie quando valido (es-ES)', () => {
      const store = mockCookieStore({ corgly_locale: 'es-ES' });
      expect(detectLocale(store)).toBe('es-ES');
    });

    it('retorna locale do cookie quando valido (it-IT)', () => {
      const store = mockCookieStore({ corgly_locale: 'it-IT' });
      expect(detectLocale(store)).toBe('it-IT');
    });

    it('normaliza variantes do cookie (pt_br -> pt-BR)', () => {
      const store = mockCookieStore({ corgly_locale: 'pt_br' });
      expect(detectLocale(store)).toBe('pt-BR');
    });

    it('normaliza codigos curtos do cookie (pt -> pt-BR)', () => {
      const store = mockCookieStore({ corgly_locale: 'pt' });
      expect(detectLocale(store)).toBe('pt-BR');
    });

    it('cookie tem prioridade sobre Accept-Language', () => {
      const store = mockCookieStore({ corgly_locale: 'it-IT' });
      expect(detectLocale(store, 'en-US,pt-BR')).toBe('it-IT');
    });
  });

  describe('prioridade 2: Accept-Language header', () => {
    it('detecta locale simples do Accept-Language', () => {
      const store = mockCookieStore();
      expect(detectLocale(store, 'pt-BR')).toBe('pt-BR');
    });

    it('detecta primeiro locale valido em lista separada por virgula', () => {
      const store = mockCookieStore();
      expect(detectLocale(store, 'fr-FR,es-ES,en-US')).toBe('es-ES');
    });

    it('ignora pesos q=', () => {
      const store = mockCookieStore();
      expect(detectLocale(store, 'fr;q=0.9,it-IT;q=0.8,en;q=0.7')).toBe('it-IT');
    });

    it('detecta codigo curto no Accept-Language (en -> en-US)', () => {
      const store = mockCookieStore();
      expect(detectLocale(store, 'en')).toBe('en-US');
    });

    it('detecta codigo curto no Accept-Language (es -> es-ES)', () => {
      const store = mockCookieStore();
      expect(detectLocale(store, 'es')).toBe('es-ES');
    });

    it('detecta codigo curto no Accept-Language (it -> it-IT)', () => {
      const store = mockCookieStore();
      expect(detectLocale(store, 'it')).toBe('it-IT');
    });
  });

  describe('prioridade 3: fallback', () => {
    it('retorna en-US quando cookie vazio e sem Accept-Language', () => {
      const store = mockCookieStore();
      expect(detectLocale(store)).toBe('en-US');
    });

    it('retorna en-US quando cookie vazio e Accept-Language nao reconhecido', () => {
      const store = mockCookieStore();
      expect(detectLocale(store, 'ja-JP,zh-CN')).toBe('en-US');
    });

    it('retorna en-US quando cookie tem valor invalido e sem Accept-Language', () => {
      const store = mockCookieStore({ corgly_locale: 'invalid-locale' });
      expect(detectLocale(store)).toBe('en-US');
    });
  });

  describe('constantes exportadas', () => {
    it('SUPPORTED_LOCALES contem as 4 locales', () => {
      expect(SUPPORTED_LOCALES).toEqual(['pt-BR', 'en-US', 'es-ES', 'it-IT']);
    });

    it('DEFAULT_LOCALE e en-US', () => {
      expect(DEFAULT_LOCALE).toBe('en-US');
    });
  });
});
