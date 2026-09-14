// @vitest-environment node
/**
 * GAP-07 (item 018) - a linha `timezone` de app_settings nasce por migration.
 *
 * A migration 20260908221218 so criou a tabela. Sem a linha, todo leitor de
 * `getCanonicalTimezone` caia no fallback de forma independente e em silencio.
 * O que estes testes travam: existe UMA migration da linha, posterior a ultima
 * do PRED, e o SQL e idempotente sem nunca sobrescrever valor ja gravado.
 *
 * As pastas sao lidas dentro de cada caso: nada no topo do arquivo pode lancar
 * antes de o vitest registrar os testes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(process.cwd(), 'prisma/migrations');
const PADRAO_PASTA = /^\d{14}_canonical_timezone_setting_row$/;
const ULTIMA_DO_PRED = '20260909233000';
const FUSO_IANA = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/;

function pastasDaLinha(): string[] {
  return fs.readdirSync(MIGRATIONS).filter((nome) => PADRAO_PASTA.test(nome));
}

describe('migration da linha timezone em app_settings (GAP-07)', () => {
  it('RED 018 [ST003]: existe uma migration canonical_timezone_setting_row posterior a 20260909233000', () => {
    const pastas = pastasDaLinha();
    expect(pastas).toHaveLength(1);
    // Prefixos de 14 digitos: a ordem lexicografica e a ordem numerica.
    expect(pastas[0].slice(0, 14) > ULTIMA_DO_PRED).toBe(true);
  });

  it('RED 018 [ST003]: o SQL grava a linha timezone sem sobrescrever', () => {
    const pastas = pastasDaLinha();
    expect(pastas).toHaveLength(1);
    const sql = fs.readFileSync(path.join(MIGRATIONS, pastas[0], 'migration.sql'), 'utf8');

    expect(sql).toContain('INSERT INTO `app_settings` (`key`, `value`, `updatedAt`)');
    expect(sql).toContain("'timezone'");
    expect(sql).toContain('ON DUPLICATE KEY UPDATE `key` = `key`');
    expect(sql).not.toContain('INSERT IGNORE');
    expect(sql).not.toContain('REPLACE INTO');
    expect(sql).not.toContain('DELETE FROM');
    expect(sql).not.toMatch(/^[ \t]*UPDATE\b/m);
    expect(sql).not.toContain('`value` =');

    const valor = sql.match(/VALUES \('timezone', '([^']+)'/)?.[1];
    expect(valor).toBeDefined();
    expect(valor).toMatch(FUSO_IANA);
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: valor })).not.toThrow();
  });

  it('CONTROLE: a migration 20260908221218 nao grava linha', () => {
    const pasta = fs.readdirSync(MIGRATIONS).find((nome) => nome.startsWith('20260908221218_'));
    expect(pasta).toBeDefined();
    const sql = fs.readFileSync(path.join(MIGRATIONS, pasta as string, 'migration.sql'), 'utf8');
    expect(sql).toContain('CREATE TABLE `app_settings`');
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
  });
});
