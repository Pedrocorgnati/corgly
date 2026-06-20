import { beforeEach, describe, it, expect, vi } from 'vitest';
import { AppError } from '@/lib/errors';

const mockPrisma = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import {
  IDEMPOTENCY_WINDOW_MS,
  assertValidClientKey,
  buildFinancialFingerprint,
  currentWindowBucket,
  financialIdempotencyService,
  hashPayload,
  resolveRequestIdempotencyKey,
  resolveIdempotencyKey,
} from '@/lib/billing/idempotency.service';

/**
 * Acceptance T-028 / §12.4.1 (idempotency core, puro e determinístico):
 * - Repetição (mesmo usuário + pacote + payload, dentro da janela) -> mesma chave
 *   (= mesma Stripe Checkout Session via replay).
 * - Payload divergente -> chave divergente (nova sessão).
 * - Expiração: troca de bucket temporal -> chave nova.
 */

const scope = { userId: 'user_123', packageType: 'SINGLE' };
const payload = { kind: 'one_time', resolvedType: 'SINGLE', currency: 'USD', isPromo: false };
// Instante fixo no meio de uma janela para evitar flutuação de borda.
const NOW = 5 * IDEMPOTENCY_WINDOW_MS + 1_000;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$executeRaw.mockResolvedValue(1);
});

describe('resolveIdempotencyKey - rastreabilidade por usuário + pacote', () => {
  it('embute userId e packageType na chave derivada', () => {
    const key = resolveIdempotencyKey(scope, null, payload, NOW);
    expect(key).toContain('user_123');
    expect(key).toContain('SINGLE');
    expect(key.startsWith('corgly_checkout:')).toBe(true);
  });

  it('lança PAYMENT_062 (500) quando userId ausente', () => {
    expect(() =>
      resolveIdempotencyKey({ userId: '', packageType: 'SINGLE' }, null, payload, NOW),
    ).toThrowError(AppError);
    try {
      resolveIdempotencyKey({ userId: '', packageType: 'SINGLE' }, null, payload, NOW);
    } catch (e) {
      expect((e as AppError).code).toBe('PAYMENT_062');
      expect((e as AppError).status).toBe(500);
    }
  });
});

describe('resolveIdempotencyKey - replay (mesma sessão)', () => {
  it('mesma entrada dentro da janela retorna a MESMA chave (replay)', () => {
    const a = resolveIdempotencyKey(scope, null, payload, NOW);
    const b = resolveIdempotencyKey(scope, null, payload, NOW + 100);
    expect(a).toBe(b);
  });

  it('é estável ao longo de toda a janela corrente', () => {
    const bucketStart = currentWindowBucket(NOW) * IDEMPOTENCY_WINDOW_MS;
    const a = resolveIdempotencyKey(scope, null, payload, bucketStart);
    const b = resolveIdempotencyKey(scope, null, payload, bucketStart + IDEMPOTENCY_WINDOW_MS - 1);
    expect(a).toBe(b);
  });
});

describe('resolveIdempotencyKey - payload divergente (nova sessão)', () => {
  it('payload diferente gera chave diferente', () => {
    const a = resolveIdempotencyKey(scope, null, payload, NOW);
    const b = resolveIdempotencyKey(scope, null, { ...payload, currency: 'EUR' }, NOW);
    expect(a).not.toBe(b);
  });

  it('pacote diferente gera chave diferente', () => {
    const a = resolveIdempotencyKey(scope, null, payload, NOW);
    const b = resolveIdempotencyKey({ ...scope, packageType: 'BULK' }, null, payload, NOW);
    expect(a).not.toBe(b);
  });

  it('usuário diferente gera chave diferente', () => {
    const a = resolveIdempotencyKey(scope, null, payload, NOW);
    const b = resolveIdempotencyKey({ ...scope, userId: 'user_999' }, null, payload, NOW);
    expect(a).not.toBe(b);
  });
});

describe('resolveIdempotencyKey - expiração (bucket temporal)', () => {
  it('a chave muda ao cruzar a fronteira da janela', () => {
    const a = resolveIdempotencyKey(scope, null, payload, NOW);
    const b = resolveIdempotencyKey(scope, null, payload, NOW + IDEMPOTENCY_WINDOW_MS);
    expect(a).not.toBe(b);
  });

  it('currentWindowBucket incrementa exatamente uma vez por janela', () => {
    const base = currentWindowBucket(NOW);
    const bucketStart = base * IDEMPOTENCY_WINDOW_MS;
    expect(currentWindowBucket(bucketStart)).toBe(base);
    expect(currentWindowBucket(bucketStart + IDEMPOTENCY_WINDOW_MS - 1)).toBe(base);
    expect(currentWindowBucket(bucketStart + IDEMPOTENCY_WINDOW_MS)).toBe(base + 1);
  });
});

describe('resolveIdempotencyKey - chave fornecida pelo cliente', () => {
  it('honra a chave do cliente, namespaceada por usuário + pacote', () => {
    const key = resolveIdempotencyKey(scope, 'client-key-abc123', payload, NOW);
    expect(key).toBe('corgly_checkout:user_123:SINGLE:client-key-abc123');
  });

  it('chave do cliente ignora payload e janela (replay estável)', () => {
    const a = resolveIdempotencyKey(scope, 'client-key-abc123', payload, NOW);
    const b = resolveIdempotencyKey(
      scope,
      'client-key-abc123',
      { ...payload, currency: 'EUR' },
      NOW + 10 * IDEMPOTENCY_WINDOW_MS,
    );
    expect(a).toBe(b);
  });

  it('trim de espaços na chave do cliente', () => {
    const a = resolveIdempotencyKey(scope, '  client-key-abc123  ', payload, NOW);
    const b = resolveIdempotencyKey(scope, 'client-key-abc123', payload, NOW);
    expect(a).toBe(b);
  });

  it('chave em branco cai no fallback determinístico', () => {
    const a = resolveIdempotencyKey(scope, '   ', payload, NOW);
    const b = resolveIdempotencyKey(scope, null, payload, NOW);
    expect(a).toBe(b);
  });

  it('rejeita chave do cliente inválida com PAYMENT_060 (400)', () => {
    expect(() => assertValidClientKey('short')).toThrowError(AppError);
    try {
      assertValidClientKey('inv@lid key!');
    } catch (e) {
      expect((e as AppError).code).toBe('PAYMENT_060');
      expect((e as AppError).status).toBe(400);
    }
  });
});

describe('hashPayload', () => {
  it('é determinístico e truncado em 32 chars', () => {
    expect(hashPayload(payload)).toBe(hashPayload(payload));
    expect(hashPayload(payload)).toHaveLength(32);
  });

  it('difere quando o payload difere', () => {
    expect(hashPayload(payload)).not.toBe(hashPayload({ ...payload, currency: 'BRL' }));
  });

  it('trata null/undefined sem lançar', () => {
    expect(hashPayload(null)).toBe(hashPayload(undefined));
  });

  it('normaliza objetos ordenando chaves antes do hash', () => {
    expect(hashPayload({ b: 2, a: { d: 4, c: 3 } })).toBe(
      hashPayload({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});

describe('resolveRequestIdempotencyKey', () => {
  it('aceita Idempotency-Key e X-Idempotency-Key com o mesmo valor', () => {
    const headers = new Headers({
      'Idempotency-Key': 'key-12345678',
      'X-Idempotency-Key': 'key-12345678',
    });

    expect(resolveRequestIdempotencyKey(headers)).toBe('key-12345678');
  });

  it('rejeita headers idempotentes divergentes com 400', () => {
    const headers = new Headers({
      'Idempotency-Key': 'key-12345678',
      'X-Idempotency-Key': 'key-87654321',
    });

    expect(() => resolveRequestIdempotencyKey(headers)).toThrowError(AppError);
    try {
      resolveRequestIdempotencyKey(headers);
    } catch (e) {
      expect((e as AppError).code).toBe('PAYMENT_063');
      expect((e as AppError).status).toBe(400);
    }
  });
});

describe('FinancialIdempotencyService', () => {
  const payload = {
    userId: 'user-1',
    subscriptionId: 'sub-1',
    weeklyFrequency: 3,
  };

  it('sem header executa a operação sem persistir registro local', async () => {
    const operation = vi.fn().mockResolvedValue({ ok: true });

    const result = await financialIdempotencyService.run(
      'subscription_update',
      'user-1',
      null,
      payload,
      operation,
    );

    expect(result).toEqual({ result: { ok: true }, idempotentReplay: false });
    expect(operation).toHaveBeenCalledWith(null);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('replay concluído retorna o resultado salvo sem executar a operação financeira', async () => {
    const cached = { subscription: { id: 'sub-1', weeklyFrequency: 3 } };
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        attemptId: 'attempt-1',
        fingerprint: buildFinancialFingerprint({
          scope: 'subscription_update',
          ownerId: 'user-1',
          payload,
        }),
        status: 'COMPLETED',
        resultJson: cached,
      },
    ]);
    const operation = vi.fn();

    const result = await financialIdempotencyService.run(
      'subscription_update',
      'user-1',
      'key-12345678',
      payload,
      operation,
    );

    expect(result).toEqual({ result: cached, idempotentReplay: true });
    expect(operation).not.toHaveBeenCalled();
  });

  it('mesma chave com payload divergente retorna conflito 409', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        attemptId: 'attempt-1',
        fingerprint: 'different-fingerprint',
        status: 'COMPLETED',
        resultJson: { ok: true },
      },
    ]);

    await expect(
      financialIdempotencyService.run(
        'subscription_update',
        'user-1',
        'key-12345678',
        payload,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_064', status: 409 });
  });

  it('registro em andamento com a mesma chave bloqueia concorrência simples', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        attemptId: 'attempt-1',
        fingerprint: buildFinancialFingerprint({
          scope: 'subscription_update',
          ownerId: 'user-1',
          payload,
        }),
        status: 'IN_PROGRESS',
        resultJson: null,
      },
    ]);

    await expect(
      financialIdempotencyService.run(
        'subscription_update',
        'user-1',
        'key-12345678',
        payload,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_065', status: 409 });
  });
});
