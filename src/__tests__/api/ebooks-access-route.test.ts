// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { regressionEbookInput } from '../fixtures/ebooks/regression-ebook';

// Entrega do PDF pelo token (D1-D6) de ponta a ponta: resolvedor, checagem do
// PDF e gravacao do download reais; so banco, rate limit e logger sao mockados.
// O catalogo vem da fixture de regressao; nenhum ebook real entra no teste.

const mocks = vi.hoisted(() => {
  const checkRateLimit = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const tx = {
    ebookAccessToken: { updateMany: vi.fn() },
    ebookAccessLog: { create: vi.fn() },
    ebookOrder: { updateMany: vi.fn() },
  };
  const prisma = {
    ebookAccessToken: { findUnique: vi.fn() },
    ebookOrder: { updateMany: vi.fn() },
    ebookAccessLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { checkRateLimit, logger, tx, prisma };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: { EBOOK_ACCESS: { maxRequests: 10, windowMs: 60_000 } },
}));
vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));

const APP_URL = 'https://app.example.com';
const VALID_TOKEN = 'A'.repeat(43);
const SLUG = regressionEbookInput.slug;
const LOCALE = regressionEbookInput.locale;
const PDF_BYTES = '%PDF-1.4\n% fixture de regressao\n%%EOF\n';
const COPY_INVALID = regressionEbookInput.copy.errors.accessInvalid;
const COPY_REVOKED = regressionEbookInput.copy.errors.accessRevoked;
const COPY_RATE_LIMITED = regressionEbookInput.copy.errors.accessRateLimited;
const COPY_UNAVAILABLE = regressionEbookInput.copy.errors.pdfUnavailable;

let privateDir: string;

interface TokenOverrides {
  revokedAt?: Date | null;
}

/** Linha do token com o pedido pago por default. */
function tokenRow(tokenOverrides: TokenOverrides = {}) {
  return {
    id: 't1',
    downloadCount: 0,
    revokedAt: null,
    ...tokenOverrides,
    order: {
      id: 'o1',
      slug: SLUG,
      locale: LOCALE,
      paymentStatus: 'PAID',
      stripePaymentIntentId: 'pi_fixture',
      firstDownloadAt: null,
      createdAt: new Date(),
    },
  };
}

function loggedMessages(): string[] {
  const calls = [
    ...mocks.logger.error.mock.calls,
    ...mocks.logger.warn.mock.calls,
    ...mocks.logger.info.mock.calls,
  ];
  return calls.map((call) => String(JSON.stringify(call)));
}

// Import dinamico DEPOIS do resetModules: catalogo e modulos releem os stubs.
async function loadRoute() {
  return import('@/app/ebooks/acesso/[token]/route');
}

async function head(token: string): Promise<Response> {
  const { HEAD } = await loadRoute();
  const request = new NextRequest(APP_URL + '/ebooks/acesso/' + token, {
    method: 'HEAD',
    headers: { 'x-forwarded-for': '203.0.113.7' },
  });
  return HEAD(request, { params: Promise.resolve({ token }) });
}

async function get(token: string): Promise<Response> {
  const { GET } = await loadRoute();
  const request = new NextRequest(APP_URL + '/ebooks/acesso/' + token, {
    headers: { 'x-forwarded-for': '203.0.113.7' },
  });
  return GET(request, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doMock('../../../content/ebooks/index', () => ({ ebookRegistry: [regressionEbookInput] }));

  privateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebooks-private-'));
  fs.writeFileSync(path.join(privateDir, regressionEbookInput.pdfFile), PDF_BYTES);
  vi.stubEnv('EBOOKS_PRIVATE_DIR', privateDir);
  vi.stubEnv('EBOOK_DOWNLOAD_LIMIT', '');

  mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 });
  mocks.tx.ebookAccessToken.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.ebookAccessLog.create.mockResolvedValue({});
  mocks.tx.ebookOrder.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) =>
    fn(mocks.tx),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(privateDir, { recursive: true, force: true });
});

describe('GET /ebooks/acesso/{token}: entrega do PDF', () => {
  it('200 com o PDF, headers privados (D6) e download gravado antes do stream', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());

    const res = await get(VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-length')).toBe(String(Buffer.byteLength(PDF_BYTES)));
    expect(res.headers.get('content-disposition')).toContain(
      'attachment; filename="' + regressionEbookInput.pdfFile + '"',
    );
    expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''");
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect((await res.text()).startsWith('%PDF-')).toBe(true);
    expect(mocks.tx.ebookAccessToken.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.ebookAccessLog.create).toHaveBeenCalledWith({
      data: { orderId: 'o1', tokenId: 't1', ip: '203.0.113.7' },
    });
  });

  it('410 quando o contador recusa (limite atingido ou revogado na corrida)', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    mocks.tx.ebookAccessToken.updateMany.mockResolvedValue({ count: 0 });

    const res = await get(VALID_TOKEN);

    expect(res.status).toBe(410);
    expect(await res.text()).toContain(COPY_REVOKED);
    expect(mocks.tx.ebookAccessLog.create).not.toHaveBeenCalled();
  });

  it('503 com a copia da entrada quando o PDF nao esta no diretorio privado', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());
    fs.rmSync(path.join(privateDir, regressionEbookInput.pdfFile));

    const res = await get(VALID_TOKEN);

    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain(COPY_UNAVAILABLE);
    expect(html).toContain('lang="' + LOCALE + '"');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('503 sem vazar a mensagem quando o banco falha', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockRejectedValue(new Error('banco indisponivel'));

    const res = await get(VALID_TOKEN);

    expect(res.status).toBe(503);
    expect(await res.text()).toContain(COPY_UNAVAILABLE);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    for (const entry of loggedMessages()) {
      expect(entry).not.toContain('banco indisponivel');
      expect(entry).not.toContain(VALID_TOKEN);
    }
  });
});

describe('GET /ebooks/acesso/{token}: borda HTTP', () => {
  it('404 para token malformado, sem consulta', async () => {
    const res = await get('abc');

    expect(res.status).toBe(404);
    expect(await res.text()).toContain(COPY_INVALID);
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(mocks.prisma.ebookAccessToken.findUnique).not.toHaveBeenCalled();
  });

  it('404 para token inexistente', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(null);

    const res = await get(VALID_TOKEN);

    expect(res.status).toBe(404);
    expect(await res.text()).toContain(COPY_INVALID);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('410 para token revogado, sem gravar download', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow({ revokedAt: new Date() }));

    const res = await get(VALID_TOKEN);

    expect(res.status).toBe(410);
    expect(await res.text()).toContain(COPY_REVOKED);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('429 com Retry-After quando o rate limit estoura', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });

    const res = await get(VALID_TOKEN);

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(await res.text()).toContain(COPY_RATE_LIMITED);
    expect(mocks.prisma.ebookAccessToken.findUnique).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('405 com Allow: GET, HEAD para %s', async (method) => {
    const route = await loadRoute();

    const res = route[method]();

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('Method not allowed.');
  });
});

describe('HEAD /ebooks/acesso/{token}: espelha o GET sem gravar download', () => {
  it('200 com os headers do PDF, sem corpo e sem gravar download', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow());

    const res = await head(VALID_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-length')).toBe(String(Buffer.byteLength(PDF_BYTES)));
    expect(res.headers.get('content-disposition')).toContain(
      'attachment; filename="' + regressionEbookInput.pdfFile + '"',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(await res.text()).toBe('');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.ebookAccessToken.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.ebookAccessLog.create).not.toHaveBeenCalled();
    expect(mocks.tx.ebookOrder.updateMany).not.toHaveBeenCalled();
  });

  it('404 sem corpo para token malformado', async () => {
    const res = await head('abc');

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(mocks.prisma.ebookAccessToken.findUnique).not.toHaveBeenCalled();
  });

  it('410 sem corpo para token revogado', async () => {
    mocks.prisma.ebookAccessToken.findUnique.mockResolvedValue(tokenRow({ revokedAt: new Date() }));

    const res = await head(VALID_TOKEN);

    expect(res.status).toBe(410);
    expect(await res.text()).toBe('');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
