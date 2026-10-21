import { mkdir, mkdtemp, rm, writeFile, type FileHandle } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EbookFulfillmentError } from '@/lib/ebooks/errors';
import { checkEbookPdf } from '@/lib/ebooks/pdf-check';
import { AppError } from '@/lib/errors';

async function captureError(fn: () => Promise<unknown>): Promise<EbookFulfillmentError> {
  try {
    await fn();
  } catch (err) {
    return err as EbookFulfillmentError;
  }
  throw new Error('esperava erro, nada foi lancado');
}

function failingOpen(code: string) {
  return vi.fn(async (): Promise<FileHandle> => {
    throw Object.assign(new Error(`falha de fs ${code}`), { code });
  });
}

describe('checkEbookPdf', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ebook-pdf-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('devolve o caminho absoluto dentro do diretorio e o tamanho do PDF valido', async () => {
    const pdfFile = 'guia.pdf';
    const content = Buffer.concat([Buffer.from('%PDF-'), Buffer.from('1.7\nconteudo')]);
    await writeFile(path.resolve(dir, pdfFile), content);

    const result = await checkEbookPdf({ pdfFile }, dir);

    expect(result.absolutePath).toBe(path.resolve(dir, pdfFile));
    expect(result.absolutePath.startsWith(`${path.resolve(dir)}${path.sep}`)).toBe(true);
    expect(result.sizeBytes).toBe(content.byteLength);
  });

  it('marca como permanente quando o PDF esta ausente (ENOENT)', async () => {
    const err = await captureError(() => checkEbookPdf({ pdfFile: 'ausente.pdf' }, dir));

    expect(err).toBeInstanceOf(EbookFulfillmentError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
    expect(err.status).toBe(500);
    expect(err.transient).toBe(false);
    expect(err.message).toContain('ausente.pdf');
    expect(err.message).toContain('ausente');
  });

  it('marca como permanente quando o PDF tem 0 byte', async () => {
    await writeFile(path.resolve(dir, 'vazio.pdf'), '');

    const err = await captureError(() => checkEbookPdf({ pdfFile: 'vazio.pdf' }, dir));

    expect(err).toBeInstanceOf(EbookFulfillmentError);
    expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
    expect(err.transient).toBe(false);
    expect(err.message).toContain('vazio');
    expect(err.message).toContain('vazio.pdf');
  });

  it('marca como permanente quando a assinatura nao e %PDF-', async () => {
    await writeFile(path.resolve(dir, 'png.pdf'), Buffer.from('%PNG-conteudo'));

    const err = await captureError(() => checkEbookPdf({ pdfFile: 'png.pdf' }, dir));

    expect(err).toBeInstanceOf(EbookFulfillmentError);
    expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
    expect(err.transient).toBe(false);
    expect(err.message).toContain('assinatura invalida');
    expect(err.message).toContain('png.pdf');
  });

  it('marca como permanente quando o conteudo tem menos de 5 bytes', async () => {
    await writeFile(path.resolve(dir, 'curto.pdf'), '%PD');

    const err = await captureError(() => checkEbookPdf({ pdfFile: 'curto.pdf' }, dir));

    expect(err).toBeInstanceOf(EbookFulfillmentError);
    expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
    expect(err.transient).toBe(false);
    expect(err.message).toContain('assinatura invalida');
    expect(err.message).toContain('curto.pdf');
  });

  it('marca como permanente quando o alvo e um diretorio com nome .pdf', async () => {
    await mkdir(path.resolve(dir, 'pasta.pdf'));

    const err = await captureError(() => checkEbookPdf({ pdfFile: 'pasta.pdf' }, dir));

    expect(err).toBeInstanceOf(EbookFulfillmentError);
    expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
    expect(err.transient).toBe(false);
    expect(err.message).toContain('arquivo regular');
    expect(err.message).toContain('pasta.pdf');
  });

  it.each(['../fora.pdf', '/etc/passwd.pdf'])(
    'marca como permanente sem ler disco quando pdfFile escapa do diretorio (%s)',
    async (pdfFile) => {
      const openSpy = vi.fn();

      const err = await captureError(() => checkEbookPdf({ pdfFile }, dir, { open: openSpy }));

      expect(err).toBeInstanceOf(EbookFulfillmentError);
      expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
      expect(err.transient).toBe(false);
      expect(err.message).toContain(pdfFile);
      expect(openSpy).not.toHaveBeenCalled();
    },
  );

  it('marca como permanente quando o fs recusa abrir como arquivo (EISDIR)', async () => {
    const err = await captureError(() =>
      checkEbookPdf({ pdfFile: 'pasta.pdf' }, dir, { open: failingOpen('EISDIR') }),
    );

    expect(err).toBeInstanceOf(EbookFulfillmentError);
    expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
    expect(err.transient).toBe(false);
    expect(err.message).toContain('arquivo regular');
    expect(err.message).toContain('pasta.pdf');
  });

  it.each(['EIO', 'EACCES', 'EMFILE'])(
    'marca como transiente quando o fs falha com %s',
    async (code) => {
      const err = await captureError(() =>
        checkEbookPdf({ pdfFile: 'guia.pdf' }, dir, { open: failingOpen(code) }),
      );

      expect(err).toBeInstanceOf(EbookFulfillmentError);
      expect(err.code).toBe('EBOOK_FULFILLMENT_PDF_UNAVAILABLE');
      expect(err.transient).toBe(true);
      expect(err.message).toContain(code);
      expect(err.message).toContain('guia.pdf');
    },
  );
});
