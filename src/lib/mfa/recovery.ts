/**
 * @module lib/mfa/recovery
 * Codigos de recuperacao MFA — conjunto de uso unico.
 *
 * Gerados no cadastro/reset, exibidos UMA UNICA VEZ ao admin, e armazenados
 * apenas como hash (bcrypt). Cada codigo e consumido uma unica vez
 * (invalidado apos uso) e o conjunto inteiro e regeravel.
 */

import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

/** Quantidade de codigos gerados por conjunto. */
export const RECOVERY_CODES_COUNT = 10;
/** Charset sem caracteres ambiguos (sem 0/O/1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUP_LEN = 4;
const GROUPS = 3; // formato XXXX-XXXX-XXXX

/** Normaliza um codigo para comparacao (maiusculo, sem hifens/espacos). */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, '');
}

/** Gera um unico codigo formatado XXXX-XXXX-XXXX. */
function generateOneCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = '';
    for (let i = 0; i < GROUP_LEN; i++) {
      group += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/** Gera um conjunto novo de codigos de recuperacao (em claro). */
export function generateRecoveryCodes(count: number = RECOVERY_CODES_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateOneCode());
  }
  return [...codes];
}

/** Hash de um codigo de recuperacao (bcrypt sobre a forma normalizada). */
export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeRecoveryCode(code), 10);
}

/** Compara um codigo informado contra um hash armazenado. */
export async function verifyRecoveryCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(normalizeRecoveryCode(code), hash);
}
