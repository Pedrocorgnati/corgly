/**
 * @module lib/mfa/totp
 * TOTP (RFC 6238) puro sobre node:crypto — sem dependencia externa.
 *
 * Implementa geracao/verificacao de codigos TOTP HMAC-SHA1 de 6 digitos com
 * janela de tolerancia (clock skew) e exposicao do counter (time-step) para
 * que o chamador aplique guarda anti-replay (recusar counter ja consumido).
 *
 * O segredo e manipulado em base32 (RFC 4648), formato aceito por apps
 * autenticadores (Google Authenticator, Authy, 1Password, etc).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Tamanho padrao do time-step TOTP em segundos (RFC 6238 recomenda 30). */
export const TOTP_STEP_SECONDS = 30;
/** Numero de digitos do codigo. */
export const TOTP_DIGITS = 6;
/** Janela padrao de tolerancia (passos para tras/frente). 1 = +-30s. */
export const TOTP_DEFAULT_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Codifica bytes em base32 sem padding. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decodifica base32 (tolerante a padding/minusculas/espacos). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('TOTP_SECRET_INVALID_BASE32');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Gera um novo segredo TOTP em base32.
 * 20 bytes (160 bits) = recomendacao RFC 4226 para HMAC-SHA1.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Converte um instante (ms epoch) no counter (time-step) TOTP. */
export function counterForTime(
  nowMs: number,
  stepSeconds: number = TOTP_STEP_SECONDS,
): number {
  return Math.floor(nowMs / 1000 / stepSeconds);
}

/** Gera o codigo TOTP para um counter especifico. */
export function generateTotp(
  secretBase32: string,
  counter: number,
  digits: number = TOTP_DIGITS,
): string {
  const key = base32Decode(secretBase32);

  // Counter como big-endian de 8 bytes.
  const counterBuf = Buffer.alloc(8);
  // Suporta counters acima de 2^32 sem perder precisao usando duas metades.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (binary % 10 ** digits).toString().padStart(digits, '0');
  return otp;
}

export interface TotpVerifyResult {
  /** true se o codigo casou em algum passo dentro da janela. */
  valid: boolean;
  /** Counter (time-step) que casou — usado para guarda anti-replay. null se invalido. */
  counter: number | null;
}

/**
 * Verifica um codigo TOTP dentro de uma janela de tolerancia.
 *
 * Retorna o counter que casou para que o chamador persista e recuse reuso
 * (anti-replay): so aceitar counters estritamente maiores que o ultimo usado.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  opts: { nowMs: number; window?: number; digits?: number; stepSeconds?: number },
): TotpVerifyResult {
  const digits = opts.digits ?? TOTP_DIGITS;
  const window = opts.window ?? TOTP_DEFAULT_WINDOW;
  const stepSeconds = opts.stepSeconds ?? TOTP_STEP_SECONDS;

  const normalized = token.replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(normalized)) {
    return { valid: false, counter: null };
  }

  const center = counterForTime(opts.nowMs, stepSeconds);
  for (let offset = -window; offset <= window; offset++) {
    const counter = center + offset;
    if (counter < 0) continue;
    const expected = generateTotp(secretBase32, counter, digits);
    // Comparacao em tempo constante para evitar timing oracle.
    const a = Buffer.from(expected);
    const b = Buffer.from(normalized);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { valid: true, counter };
    }
  }
  return { valid: false, counter: null };
}

/**
 * Monta a otpauth:// URI consumida por apps autenticadores (e QR codes).
 * label = issuer:accountName conforme convencao Key URI Format.
 */
export function buildOtpauthUri(params: {
  secretBase32: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** Detecta se o input parece um codigo TOTP (6 digitos) vs codigo de recuperacao. */
export function looksLikeTotpCode(input: string): boolean {
  return /^\d{6}$/.test(input.replace(/\s+/g, ''));
}
