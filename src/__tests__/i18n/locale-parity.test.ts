import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { locales } from '../../../i18n/config';

/**
 * Guarda de paridade entre os catalogos de mensagens dos quatro locales.
 *
 * Motivacao: chaves consumidas por componentes (`landing.content_preview.*`,
 * `dashboard.nextSession.*`, `credits.paymentCanceled.*`) chegaram a producao
 * ausentes em um ou mais locales porque nada comparava os arquivos entre si.
 * Este teste falha listando exatamente as chaves divergentes.
 *
 * Le os JSON do disco (nao via import) para que o teste enxergue o arquivo tal
 * como ele e publicado, incluindo JSON malformado.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const MESSAGES_DIR = path.resolve(process.cwd(), 'i18n/messages');

function readCatalog(locale: string): Json {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const raw = fs.readFileSync(file, 'utf-8');
  return JSON.parse(raw) as Json;
}

/**
 * Achata o catalogo em `caminho.pontilhado -> valor folha`.
 * Arrays entram como `caminho[i]` para que divergencia de tamanho de lista
 * (ex.: `features` com 2 itens num locale e 3 noutro) tambem seja detectada.
 */
function flatten(node: Json, prefix = '', out: Map<string, Json> = new Map()): Map<string, Json> {
  if (Array.isArray(node)) {
    node.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out.set(prefix, node);
  return out;
}

/**
 * Extrai os nomes de argumento ICU de nivel superior de uma mensagem.
 * Ignora chaves aninhadas de `plural`/`select` (`{count, plural, =0 {Sem ...}}`
 * declara `count`, nao `Sem`).
 */
function icuArguments(message: string): string[] {
  const found = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i += 1) {
    const char = message[i];
    if (char === '{') {
      depth += 1;
      if (depth === 1) {
        let j = i + 1;
        let name = '';
        while (j < message.length && message[j] !== ',' && message[j] !== '}') {
          name += message[j];
          j += 1;
        }
        const trimmed = name.trim();
        if (trimmed) found.add(trimmed);
      }
    } else if (char === '}') {
      depth -= 1;
    }
  }
  return [...found].sort();
}

const flattened = new Map<string, Map<string, Json>>();

for (const locale of locales) {
  flattened.set(locale, flatten(readCatalog(locale)));
}

const referenceLocale = 'pt-BR';
const allKeys = [...new Set(locales.flatMap((locale) => [...flattened.get(locale)!.keys()]))].sort();

describe('i18n: paridade entre locales', () => {
  it('cobre todos os locales declarados em i18n/config', () => {
    expect(locales.length).toBeGreaterThan(1);
    for (const locale of locales) {
      expect(fs.existsSync(path.join(MESSAGES_DIR, `${locale}.json`)), `i18n/messages/${locale}.json nao existe`).toBe(true);
    }
  });

  it('nao tem chave presente em um locale e ausente em outro', () => {
    const divergences: string[] = [];

    for (const key of allKeys) {
      const present = locales.filter((locale) => flattened.get(locale)!.has(key));
      if (present.length === locales.length) continue;
      const absent = locales.filter((locale) => !flattened.get(locale)!.has(key));
      divergences.push(`${key}\n      presente em: ${present.join(', ')}\n      AUSENTE em:  ${absent.join(', ')}`);
    }

    expect(
      divergences,
      divergences.length
        ? `\n${divergences.length} chave(s) divergente(s) entre locales:\n\n  - ${divergences.join('\n  - ')}\n`
        : undefined,
    ).toEqual([]);
  });

  it('mantem o mesmo tipo de folha em todos os locales', () => {
    const divergences: string[] = [];
    const reference = flattened.get(referenceLocale)!;

    for (const key of allKeys) {
      if (!reference.has(key)) continue;
      const expectedType = typeof reference.get(key);
      for (const locale of locales) {
        const value = flattened.get(locale)!;
        if (!value.has(key)) continue;
        const actualType = typeof value.get(key);
        if (actualType !== expectedType) {
          divergences.push(`${key}: ${referenceLocale}=${expectedType} vs ${locale}=${actualType}`);
        }
      }
    }

    expect(
      divergences,
      divergences.length ? `\nTipos divergentes:\n  - ${divergences.join('\n  - ')}\n` : undefined,
    ).toEqual([]);
  });

  it('nao tem valor vazio', () => {
    const empties: string[] = [];
    for (const locale of locales) {
      for (const [key, value] of flattened.get(locale)!) {
        if (typeof value !== 'string' || value.trim() === '') {
          empties.push(`${locale}:${key}`);
        }
      }
    }

    expect(
      empties,
      empties.length ? `\nValores vazios ou nao-string:\n  - ${empties.join('\n  - ')}\n` : undefined,
    ).toEqual([]);
  });

  it('mantem os mesmos argumentos ICU em todos os locales', () => {
    const divergences: string[] = [];
    const reference = flattened.get(referenceLocale)!;

    for (const key of allKeys) {
      const base = reference.get(key);
      if (typeof base !== 'string') continue;
      const expectedArgs = icuArguments(base);
      for (const locale of locales) {
        if (locale === referenceLocale) continue;
        const value = flattened.get(locale)!.get(key);
        if (typeof value !== 'string') continue;
        const actualArgs = icuArguments(value);
        if (actualArgs.join('|') !== expectedArgs.join('|')) {
          divergences.push(
            `${key}: ${referenceLocale}={${expectedArgs.join(', ')}} vs ${locale}={${actualArgs.join(', ')}}`,
          );
        }
      }
    }

    expect(
      divergences,
      divergences.length ? `\nArgumentos ICU divergentes:\n  - ${divergences.join('\n  - ')}\n` : undefined,
    ).toEqual([]);
  });

  it('publica as chaves da secao de preview de conteudo da landing', () => {
    for (const locale of locales) {
      const flat = flattened.get(locale)!;
      for (const leaf of ['badge', 'title', 'subtitle', 'cta']) {
        const key = `landing.content_preview.${leaf}`;
        expect(flat.has(key), `${locale} nao publica ${key}`).toBe(true);
      }
    }
  });
});
