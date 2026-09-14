/**
 * @module lib/google/credential-crypto
 * Cifragem em repouso do refresh token do Google Calendar (AES-256-GCM).
 *
 * Mesmo contrato de `src/lib/mfa/secret-crypto.ts` (chave de 32 bytes derivada
 * de `env.ENCRYPTION_KEY` via SHA-256, IV aleatorio de 12 bytes, auth tag de 16
 * bytes, formato serializado `ivHex:tagHex:ctHex`). A duplicacao e deliberada e
 * declarada na task 019 do loop 09-06-corgly-saas-agenda-google-bloqueio-ocupado:
 * manter o modulo separado preserva o contrato de MFA intocado.
 *
 * O refresh token NUNCA e persistido nem logado em claro.
 */

import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { env } from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/** Deriva a chave AES-256 (32 bytes) a partir de ENCRYPTION_KEY. */
function deriveKey(): Buffer {
  return createHash('sha256').update(env.ENCRYPTION_KEY, 'utf8').digest();
}

/** Cifra o refresh token -> `ivHex:tagHex:ctHex`. */
export function encryptCredential(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/** Decifra `ivHex:tagHex:ctHex` -> refresh token em claro. Lanca se adulterado. */
export function decryptCredential(serialized: string): string {
  const parts = serialized.split(':');
  if (parts.length !== 3) {
    throw new Error('GOOGLE_CREDENTIAL_MALFORMED');
  }
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}
