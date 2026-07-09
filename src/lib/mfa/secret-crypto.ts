/**
 * @module lib/mfa/secret-crypto
 * Cifragem em repouso do segredo TOTP (AES-256-GCM).
 *
 * O segredo TOTP NUNCA e persistido em claro. Usa-se uma chave de 32 bytes
 * derivada de `env.ENCRYPTION_KEY` (SHA-256) com AES-256-GCM (IV aleatorio de
 * 12 bytes + auth tag de 16 bytes). Formato serializado: `ivHex:tagHex:ctHex`.
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

/** Cifra um segredo (base32) -> `ivHex:tagHex:ctHex`. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/** Decifra `ivHex:tagHex:ctHex` -> segredo em claro. Lanca se adulterado. */
export function decryptSecret(serialized: string): string {
  const parts = serialized.split(':');
  if (parts.length !== 3) {
    throw new Error('MFA_SECRET_MALFORMED');
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
