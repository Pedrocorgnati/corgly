import { describe, it, expect } from 'vitest';
import { getErrorCopy, listMappedCodes } from '@/lib/errors/copy';
import { locales, defaultLocale, type Locale } from '../../../i18n/config';

/**
 * Guarda do catalogo de copy de erro (`src/lib/errors/copy.ts`).
 *
 * Motivacao: o catalogo ficou meses sem nenhum importador enquanto
 * `src/lib/api-client.ts` sintetizava mensagem fixa — uma delas em ingles
 * ("Request aborted"), as outras em pt-BR. Agora o api-client consome o
 * catalogo, e este teste trava as duas propriedades que tornam esse consumo
 * seguro:
 *
 *  1. todo codigo curado tem copy nao vazia nos QUATRO locales;
 *  2. codigo NAO curado cai num fallback TRADUZIDO (nunca string vazia, nunca
 *     pt-BR fixo para quem le em outro idioma).
 */

/**
 * Codigos que `src/lib/api-client.ts` sintetiza quando a resposta nao traz
 * `code` proprio. Sao os unicos para os quais nao existe mensagem autoral do
 * servidor: se sumirem do catalogo, o usuario volta a ver texto tecnico.
 */
const CODES_SINTETIZADOS_PELO_API_CLIENT = [
  'AUTH_001',
  'RATE_LIMITED',
  'ABORTED',
  'NETWORK_ERROR',
  'INTERNAL_ERROR',
] as const;

/** Codigo de dominio do backend deliberadamente fora do catalogo. */
const CODIGO_NAO_CURADO = 'PAYMENT_066';

describe('errors/copy: catalogo de copy de erro', () => {
  it('mapeia todos os codigos que o api-client sintetiza', () => {
    const mapped = listMappedCodes();
    const ausentes = CODES_SINTETIZADOS_PELO_API_CLIENT.filter(
      (code) => !mapped.includes(code),
    );

    expect(
      ausentes,
      ausentes.length
        ? `\nCodigos sintetizados pelo api-client sem entrada no catalogo:\n  - ${ausentes.join('\n  - ')}\n`
        : undefined,
    ).toEqual([]);
  });

  it('tem titulo e descricao nao vazios em todos os locales para todo codigo mapeado', () => {
    const falhas: string[] = [];

    for (const code of listMappedCodes()) {
      for (const locale of locales) {
        const copy = getErrorCopy(code, locale);
        if (!copy.title.trim()) falhas.push(`${code} / ${locale}: title vazio`);
        if (!copy.description.trim()) falhas.push(`${code} / ${locale}: description vazia`);
        if (copy.action !== undefined && !copy.action.trim()) {
          falhas.push(`${code} / ${locale}: action declarada mas vazia`);
        }
      }
    }

    expect(
      falhas,
      falhas.length ? `\nCopy incompleta:\n  - ${falhas.join('\n  - ')}\n` : undefined,
    ).toEqual([]);
  });

  it('traduz de fato: nenhum codigo mapeado repete a copy de pt-BR nos outros locales', () => {
    const naoTraduzidos: string[] = [];
    const outros = locales.filter((locale) => locale !== 'pt-BR');

    for (const code of listMappedCodes()) {
      const referencia = getErrorCopy(code, 'pt-BR');
      for (const locale of outros) {
        const copy = getErrorCopy(code, locale);
        if (copy.description === referencia.description) {
          naoTraduzidos.push(`${code} / ${locale}: description identica a pt-BR`);
        }
      }
    }

    expect(
      naoTraduzidos,
      naoTraduzidos.length
        ? `\nCopy nao traduzida:\n  - ${naoTraduzidos.join('\n  - ')}\n`
        : undefined,
    ).toEqual([]);
  });

  it('resolve os apelidos para a entrada canonica', () => {
    for (const locale of locales) {
      expect(getErrorCopy('RATE_LIMITED', locale)).toEqual(getErrorCopy('RATE_LIMIT', locale));
      expect(getErrorCopy('NETWORK_ERROR', locale)).toEqual(getErrorCopy('NET_001', locale));
    }
  });

  it('faz fallback TRADUZIDO para codigo nao mapeado, nunca em pt-BR fixo', () => {
    expect(listMappedCodes()).not.toContain(CODIGO_NAO_CURADO);

    for (const locale of locales) {
      const fallback = getErrorCopy(CODIGO_NAO_CURADO, locale);
      expect(fallback).toEqual(getErrorCopy('INTERNAL_ERROR', locale));
      expect(fallback.description.trim()).not.toBe('');
    }

    // O ponto do defeito original: um leitor de en-US nao pode receber pt-BR.
    expect(getErrorCopy(CODIGO_NAO_CURADO, 'en-US').description).not.toBe(
      getErrorCopy(CODIGO_NAO_CURADO, 'pt-BR').description,
    );
  });

  it('atende os quatro locales declarados em i18n/config, incluindo o default', () => {
    expect(locales).toHaveLength(4);
    const locale: Locale = defaultLocale;
    expect(getErrorCopy('INTERNAL_ERROR', locale).description.trim()).not.toBe('');
  });
});
