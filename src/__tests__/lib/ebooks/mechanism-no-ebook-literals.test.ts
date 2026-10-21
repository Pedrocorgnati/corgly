import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Guarda anti-caso-especial: o mecanismo nao conhece nenhum ebook pelo nome.
// Conjunto fechado definido pelo runbook do item 002 (D-G); nao cresce sem
// mudanca declarada naquele runbook.
const FORBIDDEN_LITERALS = [
  'regression-fixture-ebook',
  'english',
  'ingles',
  'espanol',
  'espanhol',
  'italiano',
  'italiana',
] as const;

const MECHANISM_DIR = path.resolve(process.cwd(), 'src/lib/ebooks');

describe('mecanismo de ebooks sem literal de ebook especifico', () => {
  const files = fs
    .readdirSync(MECHANISM_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort();

  it('le ao menos um arquivo do mecanismo', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s nao contem literal proibido', (name) => {
    const content = fs.readFileSync(path.join(MECHANISM_DIR, name), 'utf8').toLowerCase();
    const found = FORBIDDEN_LITERALS.filter((literal) => content.includes(literal));
    expect(found).toEqual([]);
  });
});
