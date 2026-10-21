import 'server-only';

import path from 'node:path';

import { EbookConfigError } from './errors';

/**
 * Resolve o diretorio privado dos PDFs a partir de `EBOOKS_PRIVATE_DIR`.
 *
 * Sem fallback silencioso para o default de dev e sem acesso a disco: a
 * existencia do diretorio e o guard de path traversal ficam com o leitor do PDF.
 */
export function resolveEbooksPrivateDir(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.EBOOKS_PRIVATE_DIR;
  if (raw === undefined || raw.trim() === '') {
    throw new EbookConfigError(
      'EBOOK_PRIVATE_DIR_MISSING',
      'EBOOKS_PRIVATE_DIR nao definida: informe o caminho absoluto do diretorio privado dos PDFs.',
    );
  }
  if (!path.isAbsolute(raw)) {
    throw new EbookConfigError(
      'EBOOK_PRIVATE_DIR_NOT_ABSOLUTE',
      `EBOOKS_PRIVATE_DIR precisa ser um caminho absoluto (recebido: ${raw}).`,
    );
  }
  return path.resolve(raw);
}
