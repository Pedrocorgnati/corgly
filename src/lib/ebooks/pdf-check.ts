import 'server-only';

import { open, type FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { EbookFulfillmentError } from './errors';
import type { EbookCatalogEntry } from './schema';

/**
 * Confere o PDF do ebook dentro do diretorio privado antes do envio.
 *
 * `entry.pdfFile` e resolvido contra `privateDir` com guard de traversal antes
 * de qualquer I/O. Ausente, vazio, sem assinatura `%PDF-`, sem arquivo regular
 * ou fora do diretorio sao permanentes; falha de filesystem e transiente.
 * Recebe `privateDir` ja resolvido: o `EbookConfigError` de
 * `resolveEbooksPrivateDir()` e responsabilidade do chamador (ST008).
 */
export async function checkEbookPdf(
  entry: Pick<EbookCatalogEntry, 'pdfFile'>,
  privateDir: string,
  deps: { open?: typeof open } = {},
): Promise<{ absolutePath: string; sizeBytes: number }> {
  const root = path.resolve(privateDir);
  const target = path.resolve(root, entry.pdfFile);
  const rel = path.relative(root, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw unavailable(`PDF do ebook fora do diretorio privado (${entry.pdfFile}).`, false);
  }

  const openFile = deps.open ?? open;
  let handle: FileHandle | undefined;
  try {
    handle = await openFile(target, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw unavailable(`PDF do ebook nao e um arquivo regular (${entry.pdfFile}).`, false);
    }
    if (stat.size === 0) {
      throw unavailable(`PDF do ebook vazio no diretorio privado (${entry.pdfFile}).`, false);
    }
    const signature = Buffer.alloc(5);
    const { bytesRead } = await handle.read(signature, 0, 5, 0);
    if (bytesRead !== 5 || signature.toString('utf8') !== '%PDF-') {
      throw unavailable(`PDF do ebook com assinatura invalida (${entry.pdfFile}).`, false);
    }
    return { absolutePath: target, sizeBytes: stat.size };
  } catch (err) {
    if (err instanceof EbookFulfillmentError) {
      throw err;
    }
    throw mapFsError(err, entry.pdfFile);
  } finally {
    if (handle !== undefined) {
      await handle.close();
    }
  }
}

/** Erro `EBOOK_FULFILLMENT_PDF_UNAVAILABLE` com a causa da checagem. */
function unavailable(message: string, transient: boolean): EbookFulfillmentError {
  return new EbookFulfillmentError('EBOOK_FULFILLMENT_PDF_UNAVAILABLE', message, { transient });
}

/** Traduz erro de fs: ENOENT/EISDIR permanentes, demais transitivos com errno. */
function mapFsError(err: unknown, pdfFile: string): EbookFulfillmentError {
  const code = isErrnoException(err) ? err.code : undefined;
  if (code === 'ENOENT') {
    return unavailable(`PDF do ebook ausente no diretorio privado (${pdfFile}).`, false);
  }
  if (code === 'EISDIR') {
    return unavailable(`PDF do ebook nao e um arquivo regular (${pdfFile}).`, false);
  }
  const errno = code === undefined ? '' : ` [${code}]`;
  return unavailable(`Falha temporaria ao ler o PDF do ebook (${pdfFile})${errno}.`, true);
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
