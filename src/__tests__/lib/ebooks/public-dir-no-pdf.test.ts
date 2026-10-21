// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// D2: PDF de ebook nunca fica em public/. Guarda estatica contra regressao de
// alguem copiar um PDF para uma pasta servida sem autenticacao.

/** Caminhos relativos de todo arquivo .pdf (sem distinguir caixa); nao segue symlink. */
function collectPdfRelPaths(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return found.sort();
}

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('public/ sem PDF (D2)', () => {
  it('public/ existe e nao contem nenhum arquivo .pdf', () => {
    const publicDir = path.join(process.cwd(), 'public');
    expect(fs.existsSync(publicDir)).toBe(true);
    expect(collectPdfRelPaths(publicDir)).toEqual([]);
  });

  it('o coletor acha .PDF aninhado e ignora extensoes parecidas', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebooks-public-'));
    fs.mkdirSync(path.join(tempDir, 'a', 'b'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'c'));
    fs.writeFileSync(path.join(tempDir, 'a', 'b', 'livro.PDF'), '%PDF-1.4');
    fs.writeFileSync(path.join(tempDir, 'c', 'c.txt'), 'texto');
    fs.writeFileSync(path.join(tempDir, 'd.pdf.txt'), 'texto');

    expect(collectPdfRelPaths(tempDir)).toEqual(['a/b/livro.PDF']);
  });
});
