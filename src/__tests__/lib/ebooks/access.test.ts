// @vitest-environment node
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashEbookAccessToken } from '@/lib/ebooks/access-token';
import { ebookCatalogEntrySchema } from '@/lib/ebooks/schema';
import {
  EbookAccessConfigError,
  assertEbooksPrivateDirNotPublic,
  parseEbookDownloadLimit,
  recordEbookDownload,
  resolveEbookAccess,
  type EbookAccessDeps,
} from '@/lib/ebooks/access';
import { regressionEbookInput } from '../../fixtures/ebooks/regression-ebook';

// Fakes em memoria: nenhum I/O real, nenhum ebook real, nenhum token cru em log.

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  RATE_LIMITS: { EBOOK_ACCESS: { maxRequests: 10, windowMs: 60_000 } },
}));

vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));

const entry = ebookCatalogEntrySchema.parse(regressionEbookInput);
const VALID_TOKEN = 'A'.repeat(43);
const TOKEN_HASH = hashEbookAccessToken(VALID_TOKEN);
const FIXED_NOW = new Date('2030-01-01T00:00:00.000Z');

type PrismaFake = {
  ebookAccessToken: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  ebookAccessLog: { create: ReturnType<typeof vi.fn> };
  ebookOrder: { updateMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function makePrismaFake(): PrismaFake {
  const fake: PrismaFake = {
    ebookAccessToken: { findUnique: vi.fn(), updateMany: vi.fn() },
    ebookAccessLog: { create: vi.fn() },
    ebookOrder: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  fake.$transaction.mockImplementation(async (fn: (tx: PrismaFake) => Promise<unknown>) => fn(fake));
  return fake;
}

function makeDeps(overrides: Partial<EbookAccessDeps> = {}) {
  const prisma = makePrismaFake();
  const checkPdf = vi.fn(async () => ({
    absolutePath: '/tmp/privado/regression-fixture-ebook.pdf',
    sizeBytes: 10,
  }));
  const downloadLimit = vi.fn((): number | null => null);
  const privateDir = vi.fn(() => path.join(os.tmpdir(), 'ebooks-privado-fake'));
  const deps: EbookAccessDeps = {
    prisma: prisma as unknown as EbookAccessDeps['prisma'],
    catalog: [entry],
    rateLimit: mocks.rateLimit as unknown as EbookAccessDeps['rateLimit'],
    privateDir,
    cwd: () => path.join(os.tmpdir(), 'cwd-fake'),
    checkPdf: checkPdf as unknown as EbookAccessDeps['checkPdf'],
    now: () => FIXED_NOW,
    downloadLimit,
    ...overrides,
  };
  return { deps, prisma, checkPdf, downloadLimit, privateDir };
}

function orderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'o1',
    slug: entry.slug,
    locale: entry.locale,
    paymentStatus: 'PAID',
    stripePaymentIntentId: 'pi_fake',
    firstDownloadAt: null,
    createdAt: new Date('2029-12-31T00:00:00.000Z'),
    ...overrides,
  };
}

function tokenRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 't1', downloadCount: 0, revokedAt: null, order: orderRow(), ...overrides };
}

function allowRateLimit(): void {
  mocks.rateLimit.mockResolvedValue({ allowed: true, resetAt: FIXED_NOW.getTime() + 60_000 });
}

function denyRateLimit(resetAtMs: number): void {
  mocks.rateLimit.mockResolvedValue({ allowed: false, resetAt: resetAtMs });
}

const baseInput = { token: VALID_TOKEN, ip: '203.0.113.1', acceptLanguage: null };

beforeEach(() => {
  mocks.rateLimit.mockReset();
  mocks.logger.error.mockReset();
  mocks.logger.warn.mockReset();
  mocks.logger.info.mockReset();
});

describe('resolveEbookAccess', () => {
  it('token malformado devolve 404 sem consulta ao banco e sem rate limit por token', async () => {
    allowRateLimit();
    const { deps, prisma } = makeDeps();
    const result = await resolveEbookAccess(deps, { ...baseInput, token: 'curto' });
    expect(result).toEqual({
      kind: 'invalid',
      status: 404,
      locale: 'en',
      message: 'Acesso ficticio invalido',
    });
    expect(prisma.ebookAccessToken.findUnique).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.rateLimit.mock.calls[0]?.[0]).toBe('ebook-access:ip:203.0.113.1');
  });

  it('token inexistente devolve 404', async () => {
    allowRateLimit();
    const { deps, prisma } = makeDeps();
    prisma.ebookAccessToken.findUnique.mockResolvedValue(null);
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toMatchObject({ kind: 'invalid', status: 404, message: 'Acesso ficticio invalido' });
    expect(prisma.ebookAccessToken.findUnique.mock.calls[0]?.[0]).toMatchObject({
      where: { tokenHash: TOKEN_HASH },
    });
  });

  it('token revogado devolve 410', async () => {
    allowRateLimit();
    const { deps, prisma, checkPdf } = makeDeps();
    prisma.ebookAccessToken.findUnique.mockResolvedValue(
      tokenRow({ revokedAt: new Date('2029-12-31T10:00:00.000Z') }),
    );
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toMatchObject({ kind: 'revoked', status: 410, message: 'Acesso ficticio revogado' });
    expect(checkPdf).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'ASYNC_PENDING', 'FAILED', 'REFUNDED', 'DISPUTED'])(
    'status %s devolve 410',
    async (paymentStatus) => {
      allowRateLimit();
      const { deps, prisma } = makeDeps();
      prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow({ order: orderRow({ paymentStatus }) }));
      const result = await resolveEbookAccess(deps, baseInput);
      expect(result).toMatchObject({ kind: 'revoked', status: 410, message: 'Acesso ficticio revogado' });
    },
  );

  it('PARTIALLY_REFUNDED devolve pronto', async () => {
    allowRateLimit();
    const { deps, prisma, checkPdf } = makeDeps();
    prisma.ebookAccessToken.findUnique.mockResolvedValue(
      tokenRow({ order: orderRow({ paymentStatus: 'PARTIALLY_REFUNDED' }) }),
    );
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toMatchObject({ kind: 'ready', status: 200 });
    expect(checkPdf).toHaveBeenCalledTimes(1);
  });

  it('rate limit por IP negado devolve 429 antes do lookup', async () => {
    denyRateLimit(FIXED_NOW.getTime() + 12_500);
    const { deps, prisma } = makeDeps();
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toEqual({
      kind: 'rate_limited',
      status: 429,
      retryAfterSeconds: 13,
      locale: 'en',
      message: 'Limite ficticio de acessos',
    });
    expect(prisma.ebookAccessToken.findUnique).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
  });

  it('rate limit por token negado usa o hash na chave e devolve 429', async () => {
    mocks.rateLimit.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith('ebook-access:token:'),
      resetAt: FIXED_NOW.getTime() + 20_500,
    }));
    const { deps, prisma } = makeDeps();
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toMatchObject({ kind: 'rate_limited', status: 429, retryAfterSeconds: 21 });
    expect(prisma.ebookAccessToken.findUnique).not.toHaveBeenCalled();
    const tokenKey = mocks.rateLimit.mock.calls[1]?.[0];
    expect(tokenKey).toBe(`ebook-access:token:${TOKEN_HASH}`);
    expect(tokenKey).not.toContain(VALID_TOKEN);
  });

  it('slug fora do catalogo devolve 503 com copy neutra e loga erro', async () => {
    allowRateLimit();
    const { deps, prisma } = makeDeps();
    prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow({ order: orderRow({ slug: 'fora-do-catalogo' }) }));
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toEqual({
      kind: 'unavailable',
      status: 503,
      locale: 'en',
      message: 'The file is temporarily unavailable. Please try again later.',
    });
    expect(mocks.logger.error).toHaveBeenCalledWith('[ebooks-access] slug do pedido fora do catalogo', {
      orderId: 'o1',
      slug: 'fora-do-catalogo',
    });
  });

  it('checkPdf lancando devolve 503 com pdfUnavailable', async () => {
    allowRateLimit();
    const { deps, prisma, checkPdf } = makeDeps();
    checkPdf.mockRejectedValue(Object.assign(new Error('falha de leitura'), { code: 'EBOOK_PDF_MISSING' }));
    prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toMatchObject({ kind: 'unavailable', status: 503, message: 'PDF ficticio indisponivel' });
    expect(mocks.logger.error).toHaveBeenCalledWith('[ebooks-access] PDF ou configuracao indisponivel', {
      orderId: 'o1',
      slug: entry.slug,
      code: 'EBOOK_PDF_MISSING',
    });
  });

  it('diretorio privado dentro de public/ devolve 503 sem checar o PDF', async () => {
    allowRateLimit();
    const cwd = path.join(os.tmpdir(), 'cwd-fake');
    const { deps, prisma, checkPdf } = makeDeps({ privateDir: () => path.join(cwd, 'public', 'pdfs') });
    prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toMatchObject({ kind: 'unavailable', status: 503 });
    expect(checkPdf).not.toHaveBeenCalled();
  });

  it('EBOOK_DOWNLOAD_LIMIT invalido devolve 503', async () => {
    allowRateLimit();
    const { deps, prisma, checkPdf } = makeDeps({
      downloadLimit: () => parseEbookDownloadLimit('abc'),
    });
    prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result).toMatchObject({ kind: 'unavailable', status: 503 });
    expect(checkPdf).not.toHaveBeenCalled();
  });

  it('requirePdf false devolve pdf null e nao chama checkPdf', async () => {
    allowRateLimit();
    const { deps, prisma, checkPdf } = makeDeps();
    prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    const result = await resolveEbookAccess(deps, { ...baseInput, requirePdf: false });
    expect(checkPdf).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: 'ready', status: 200, pdf: null });
  });

  it('pronto devolve entrada, pedido, token e pdf completos', async () => {
    allowRateLimit();
    const { deps, prisma, checkPdf } = makeDeps();
    checkPdf.mockResolvedValue({ absolutePath: '/tmp/privado/regression-fixture-ebook.pdf', sizeBytes: 321 });
    prisma.ebookAccessToken.findUnique.mockResolvedValue(
      tokenRow({ downloadCount: 2, revokedAt: null, order: orderRow({ id: 'o9' }) }),
    );
    const result = await resolveEbookAccess(deps, baseInput);
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.entry.slug).toBe(entry.slug);
    expect(result.order.id).toBe('o9');
    expect(result.token).toEqual({ id: 't1', downloadCount: 2, revokedAt: null });
    expect(result.pdf).toEqual({ absolutePath: '/tmp/privado/regression-fixture-ebook.pdf', sizeBytes: 321 });
    expect(result.locale).toBe('en');
    expect(result.status).toBe(200);
  });

  it('nenhum argumento de log contem o token cru', async () => {
    allowRateLimit();
    const { deps, prisma, checkPdf } = makeDeps();
    checkPdf.mockRejectedValue(new Error('falha de leitura'));
    prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    await resolveEbookAccess(deps, baseInput);
    prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow({ order: orderRow({ slug: 'fora-do-catalogo' }) }));
    await resolveEbookAccess(deps, baseInput);
    const calls = [...mocks.logger.error.mock.calls, ...mocks.logger.warn.mock.calls, ...mocks.logger.info.mock.calls];
    expect(calls.length).toBe(2);
    for (const call of calls) {
      expect(JSON.stringify(call)).not.toContain(VALID_TOKEN);
    }
  });
});

describe('assertEbooksPrivateDirNotPublic', () => {
  const cwd = path.join(os.tmpdir(), 'cwd-fake');
  const publicDir = path.join(cwd, 'public');

  it('lanca quando o diretorio e o proprio public/', () => {
    expect(() => assertEbooksPrivateDirNotPublic(publicDir, cwd)).toThrow(EbookAccessConfigError);
  });

  it('lanca quando o diretorio fica dentro de public/', () => {
    expect(() => assertEbooksPrivateDirNotPublic(path.join(publicDir, 'privado'), cwd)).toThrow(
      EbookAccessConfigError,
    );
  });

  it('lanca para nome iniciado por .. dentro de public/', () => {
    expect(() => assertEbooksPrivateDirNotPublic(path.join(publicDir, '..foo'), cwd)).toThrow(
      EbookAccessConfigError,
    );
  });

  it('nao lanca para diretorio fora de public/', () => {
    expect(() => assertEbooksPrivateDirNotPublic(path.join(cwd, 'privado'), cwd)).not.toThrow();
    expect(() => assertEbooksPrivateDirNotPublic(path.join(cwd, 'public-x'), cwd)).not.toThrow();
    expect(() => assertEbooksPrivateDirNotPublic(path.join(os.tmpdir(), 'outro'), cwd)).not.toThrow();
  });
});

describe('parseEbookDownloadLimit', () => {
  it.each([
    ['undefined', undefined, null],
    ['string vazia', '', null],
    ['so espacos', '   ', null],
    ['numero valido', '3', 3],
    ['numero com espacos', ' 5 ', 5],
  ])('%s', (_label, raw, expected) => {
    expect(parseEbookDownloadLimit(raw)).toBe(expected);
  });

  it.each(['0', '-1', '1.5', 'abc', '99999999999999999999'])('valor invalido %s lanca', (raw) => {
    expect(() => parseEbookDownloadLimit(raw)).toThrow(EbookAccessConfigError);
  });
});

describe('recordEbookDownload', () => {
  const input = {
    order: { id: 'o1' },
    token: { id: 't1' },
    ip: '203.0.113.1',
  };

  function makeRecordDeps(limit: number | null) {
    const prisma = makePrismaFake();
    const deps: Pick<EbookAccessDeps, 'prisma' | 'now' | 'downloadLimit'> = {
      prisma: prisma as unknown as EbookAccessDeps['prisma'],
      now: () => FIXED_NOW,
      downloadLimit: () => limit,
    };
    return { deps, prisma };
  }

  it('limite atingido devolve nao gravado e nao cria log', async () => {
    const { deps, prisma } = makeRecordDeps(2);
    prisma.ebookAccessToken.updateMany.mockResolvedValue({ count: 0 });
    const result = await recordEbookDownload(deps, input);
    expect(result).toEqual({ recorded: false, reason: 'limit_or_revoked' });
    expect(prisma.ebookAccessToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', revokedAt: null, downloadCount: { lt: 2 } },
      data: { downloadCount: { increment: 1 } },
    });
    expect(prisma.ebookAccessLog.create).not.toHaveBeenCalled();
    expect(prisma.ebookOrder.updateMany).not.toHaveBeenCalled();
  });

  it('sem limite nao impoe downloadCount no where e grava tudo', async () => {
    const { deps, prisma } = makeRecordDeps(null);
    prisma.ebookAccessToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.ebookAccessLog.create.mockResolvedValue({});
    prisma.ebookOrder.updateMany.mockResolvedValue({ count: 1 });
    const result = await recordEbookDownload(deps, input);
    expect(result).toEqual({ recorded: true });
    expect(prisma.ebookAccessToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', revokedAt: null },
      data: { downloadCount: { increment: 1 } },
    });
    expect(prisma.ebookAccessLog.create).toHaveBeenCalledWith({
      data: { orderId: 'o1', tokenId: 't1', ip: '203.0.113.1' },
    });
    expect(prisma.ebookOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', firstDownloadAt: null },
      data: { firstDownloadAt: FIXED_NOW },
    });
  });

  it('revogado entre lookup e transacao devolve nao gravado sem log', async () => {
    const { deps, prisma } = makeRecordDeps(null);
    prisma.ebookAccessToken.updateMany.mockResolvedValue({ count: 0 });
    const result = await recordEbookDownload(deps, input);
    expect(result).toEqual({ recorded: false, reason: 'limit_or_revoked' });
    expect(prisma.ebookAccessLog.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('erro nao sentinela propaga', async () => {
    const { deps, prisma } = makeRecordDeps(null);
    prisma.ebookAccessToken.updateMany.mockRejectedValue(new Error('banco fora'));
    await expect(recordEbookDownload(deps, input)).rejects.toThrow('banco fora');
    expect(prisma.ebookAccessLog.create).not.toHaveBeenCalled();
  });

  it('downloadLimit invalido propaga fora da transacao', async () => {
    const { deps, prisma } = makeRecordDeps(null);
    deps.downloadLimit = () => {
      throw new EbookAccessConfigError('EBOOK_ACCESS_DOWNLOAD_LIMIT_INVALID', 'limite invalido');
    };
    await expect(recordEbookDownload(deps, input)).rejects.toThrow(EbookAccessConfigError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
