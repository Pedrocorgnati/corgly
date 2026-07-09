// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotp,
  generateTotpSecret,
  counterForTime,
  verifyTotp,
  buildOtpauthUri,
  looksLikeTotpCode,
  TOTP_STEP_SECONDS,
} from './totp';

// Vetor canonico RFC 6238 Appendix B (SHA-1):
// segredo ASCII "12345678901234567890". Em T=59s (counter=1) o TOTP de 8 digitos
// e 94287082 → os 6 digitos finais sao 287082.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('mfa/totp base32', () => {
  it('faz roundtrip encode/decode', () => {
    const original = Buffer.from('hello-mfa-secret');
    expect(base32Decode(base32Encode(original)).toString()).toBe(original.toString());
  });

  it('decodifica tolerante a minusculas e espacos', () => {
    const enc = base32Encode(Buffer.from('abc'));
    expect(base32Decode(enc.toLowerCase()).toString()).toBe('abc');
    expect(base32Decode(`  ${enc}  `).toString()).toBe('abc');
  });

  it('rejeita base32 invalido', () => {
    expect(() => base32Decode('0189!')).toThrow('TOTP_SECRET_INVALID_BASE32');
  });
});

describe('mfa/totp generateTotpSecret', () => {
  it('gera segredos base32 distintos e decodificaveis', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(base32Decode(a).length).toBe(20);
  });
});

describe('mfa/totp generateTotp (vetor RFC 6238)', () => {
  it('produz 287082 em T=59s', () => {
    const counter = counterForTime(59_000);
    expect(counter).toBe(1);
    expect(generateTotp(RFC_SECRET, counter)).toBe('287082');
  });

  it('produz codigo diferente em outro time-step', () => {
    const c1 = generateTotp(RFC_SECRET, 1);
    const c2 = generateTotp(RFC_SECRET, 2);
    expect(c1).not.toBe(c2);
  });
});

describe('mfa/totp verifyTotp', () => {
  const nowMs = 59_000; // counter = 1

  it('aceita o codigo do passo atual e retorna o counter', () => {
    const token = generateTotp(RFC_SECRET, 1);
    const res = verifyTotp(RFC_SECRET, token, { nowMs });
    expect(res.valid).toBe(true);
    expect(res.counter).toBe(1);
  });

  it('aceita codigo dentro da janela (+-1 passo)', () => {
    const prevToken = generateTotp(RFC_SECRET, 0);
    const res = verifyTotp(RFC_SECRET, prevToken, { nowMs });
    expect(res.valid).toBe(true);
    expect(res.counter).toBe(0);
  });

  it('recusa codigo fora da janela', () => {
    const farToken = generateTotp(RFC_SECRET, 5);
    const res = verifyTotp(RFC_SECRET, farToken, { nowMs, window: 1 });
    expect(res.valid).toBe(false);
    expect(res.counter).toBeNull();
  });

  it('recusa codigo malformado (nao 6 digitos)', () => {
    expect(verifyTotp(RFC_SECRET, '12ab', { nowMs }).valid).toBe(false);
    expect(verifyTotp(RFC_SECRET, '1234567', { nowMs }).valid).toBe(false);
  });

  it('recusa codigo numerico incorreto', () => {
    expect(verifyTotp(RFC_SECRET, '000000', { nowMs }).valid).toBe(false);
  });
});

describe('mfa/totp helpers', () => {
  it('buildOtpauthUri inclui issuer, secret e period', () => {
    const uri = buildOtpauthUri({
      secretBase32: RFC_SECRET,
      accountName: 'admin@corgly.test',
      issuer: 'Corgly',
    });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain('issuer=Corgly');
    expect(uri).toContain(`period=${TOTP_STEP_SECONDS}`);
  });

  it('looksLikeTotpCode distingue TOTP de codigo de recuperacao', () => {
    expect(looksLikeTotpCode('123456')).toBe(true);
    expect(looksLikeTotpCode(' 123456 ')).toBe(true); // espacos nas bordas sao tolerados
    expect(looksLikeTotpCode('ABCD-EFGH-JKLM')).toBe(false);
    expect(looksLikeTotpCode('1234567')).toBe(false);
  });
});
