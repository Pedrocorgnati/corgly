import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildEbookAccessUrls,
  generateEbookAccessToken,
  hashEbookAccessToken,
  isWellFormedEbookAccessToken,
} from '@/lib/ebooks/access-token';

describe('generateEbookAccessToken', () => {
  it('gera token base64url de 43 caracteres', () => {
    const token = generateEbookAccessToken();

    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isWellFormedEbookAccessToken(token)).toBe(true);
  });

  it('gera tokens diferentes a cada chamada', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateEbookAccessToken()));

    expect(tokens.size).toBe(20);
  });
});

describe('hashEbookAccessToken', () => {
  it('devolve sha256 hex de 64 caracteres', () => {
    const token = generateEbookAccessToken();
    const hash = hashEbookAccessToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
  });

  it('e estavel para o mesmo token e muda com o token', () => {
    const token = generateEbookAccessToken();

    expect(hashEbookAccessToken(token)).toBe(hashEbookAccessToken(token));
    expect(hashEbookAccessToken(token)).not.toBe(hashEbookAccessToken(`${token.slice(0, 42)}x`));
    expect(hashEbookAccessToken(token)).not.toBe(token);
  });
});

describe('isWellFormedEbookAccessToken', () => {
  const valid = 'A'.repeat(21) + '_-' + 'z9'.repeat(10);

  it('aceita token de 43 caracteres base64url', () => {
    expect(valid).toHaveLength(43);
    expect(isWellFormedEbookAccessToken(valid)).toBe(true);
  });

  it.each([
    ['vazio', ''],
    ['curto', 'A'.repeat(42)],
    ['longo', 'A'.repeat(44)],
    ['adulterado com +', `${'A'.repeat(42)}+`],
    ['padding =', `${'A'.repeat(42)}=`],
    ['barra', `${'A'.repeat(20)}/${'A'.repeat(22)}`],
    ['ponto-ponto', `..${'A'.repeat(41)}`],
    ['percent-encoding %2e', `%2e${'A'.repeat(40)}`],
    ['espaco', `${'A'.repeat(42)} `],
    ['quebra de linha', `${'A'.repeat(43)}\n`],
  ])('rejeita token %s', (_label, raw) => {
    expect(isWellFormedEbookAccessToken(raw)).toBe(false);
  });
});

describe('buildEbookAccessUrls', () => {
  const token = 'A'.repeat(43);

  it('monta acesso e desistencia sobre appUrl sem barra final', () => {
    expect(buildEbookAccessUrls(token, 'https://app.exemplo.com')).toEqual({
      accessUrl: `https://app.exemplo.com/ebooks/acesso/${token}`,
      withdrawalUrl: `https://app.exemplo.com/ebooks/acesso/${token}/desistir`,
    });
  });

  it.each(['https://app.exemplo.com/', 'https://app.exemplo.com///'])(
    'remove barras finais de %s',
    (appUrl) => {
      expect(buildEbookAccessUrls(token, appUrl)).toEqual({
        accessUrl: `https://app.exemplo.com/ebooks/acesso/${token}`,
        withdrawalUrl: `https://app.exemplo.com/ebooks/acesso/${token}/desistir`,
      });
    },
  );
});
