// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// `@/lib/env` valida TODAS as env vars no import; semear antes de qualquer
// import de modulo (vi.hoisted roda antes das imports estaticas).
vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    JWT_SECRET: 'x'.repeat(32),
    JWT_EXPIRES_IN: '7d',
    CRON_SECRET: 'x'.repeat(16),
    HOCUSPOCUS_JWT_SECRET: 'x'.repeat(32),
    ENCRYPTION_KEY: 'x'.repeat(32),
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
    RESEND_API_KEY: 're_test_fake',
    EMAIL_FROM: 'noreply@corgly.test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    NEXT_PUBLIC_HOCUSPOCUS_URL: 'ws://localhost:1234',
  });
});

import { decryptCredential, encryptCredential } from '@/lib/google/credential-crypto';

const REFRESH_TOKEN = 'refresh-token-falso-de-teste';

describe('lib/google/credential-crypto', () => {
  it('roundtrip: cifra e decifra devolvendo o original', () => {
    const enc = encryptCredential(REFRESH_TOKEN);
    expect(decryptCredential(enc)).toBe(REFRESH_TOKEN);
  });

  it('serializado casa o formato ivHex:tagHex:ctHex e difere do plain', () => {
    const enc = encryptCredential(REFRESH_TOKEN);
    expect(enc).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(enc).not.toBe(REFRESH_TOKEN);
    expect(enc).not.toContain(REFRESH_TOKEN);
  });

  it('adulteracao de um caractere do ciphertext lanca', () => {
    const enc = encryptCredential(REFRESH_TOKEN);
    const parts = enc.split(':');
    const last = parts[2];
    const flipped = last.slice(0, -1) + (last.endsWith('0') ? '1' : '0');
    expect(() => decryptCredential(`${parts[0]}:${parts[1]}:${flipped}`)).toThrow();
  });

  it('formato malformado (sem 3 partes) lanca GOOGLE_CREDENTIAL_MALFORMED', () => {
    expect(() => decryptCredential('nao-e-cifrado')).toThrow('GOOGLE_CREDENTIAL_MALFORMED');
  });

  it('duas cifragens do mesmo valor produzem seriais distintos (IV aleatorio)', () => {
    expect(encryptCredential(REFRESH_TOKEN)).not.toBe(encryptCredential(REFRESH_TOKEN));
  });
});
