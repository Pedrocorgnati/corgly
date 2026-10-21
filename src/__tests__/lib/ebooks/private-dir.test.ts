import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EbookConfigError } from '@/lib/ebooks/errors';
import { resolveEbooksPrivateDir } from '@/lib/ebooks/private-dir';
import { AppError } from '@/lib/errors';

function captureError(fn: () => unknown): EbookConfigError {
  try {
    fn();
  } catch (err) {
    return err as EbookConfigError;
  }
  throw new Error('esperava erro, nada foi lancado');
}

describe('resolveEbooksPrivateDir', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lanca EBOOK_PRIVATE_DIR_MISSING quando a env esta ausente', () => {
    const err = captureError(() => resolveEbooksPrivateDir({}));
    expect(err).toBeInstanceOf(EbookConfigError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('EBOOK_PRIVATE_DIR_MISSING');
    expect(err.status).toBe(500);
    expect(err.message).toContain('EBOOKS_PRIVATE_DIR');
  });

  it.each(['', '   '])('lanca EBOOK_PRIVATE_DIR_MISSING com valor %j', (value) => {
    const err = captureError(() => resolveEbooksPrivateDir({ EBOOKS_PRIVATE_DIR: value }));
    expect(err.code).toBe('EBOOK_PRIVATE_DIR_MISSING');
    expect(err.message).toContain('EBOOKS_PRIVATE_DIR');
  });

  it('lanca EBOOK_PRIVATE_DIR_NOT_ABSOLUTE com caminho relativo', () => {
    const err = captureError(() =>
      resolveEbooksPrivateDir({ EBOOKS_PRIVATE_DIR: 'storage/ebooks-private' }),
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('EBOOK_PRIVATE_DIR_NOT_ABSOLUTE');
    expect(err.status).toBe(500);
  });

  it('devolve o caminho absoluto resolvido', () => {
    expect(resolveEbooksPrivateDir({ EBOOKS_PRIVATE_DIR: '/tmp/ebooks-private' })).toBe(
      path.resolve('/tmp/ebooks-private'),
    );
  });

  it('normaliza segmentos relativos dentro do caminho absoluto', () => {
    expect(resolveEbooksPrivateDir({ EBOOKS_PRIVATE_DIR: '/tmp/a/../b' })).toBe('/tmp/b');
  });

  it('usa process.env quando chamado sem argumento', () => {
    vi.stubEnv('EBOOKS_PRIVATE_DIR', '/tmp/ebooks-from-process-env');
    expect(resolveEbooksPrivateDir()).toBe('/tmp/ebooks-from-process-env');
  });

  it('lanca sem fallback quando process.env nao tem a env', () => {
    vi.stubEnv('EBOOKS_PRIVATE_DIR', undefined);
    const err = captureError(() => resolveEbooksPrivateDir());
    expect(err.code).toBe('EBOOK_PRIVATE_DIR_MISSING');
  });
});
