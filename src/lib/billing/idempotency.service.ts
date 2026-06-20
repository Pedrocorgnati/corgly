import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';

/**
 * Idempotency service - deriva/valida a Idempotency-Key enviada ao Stripe no
 * fluxo de checkout. Sem dependência de banco: a deduplicação efetiva é feita
 * pelo próprio Stripe (chaves idempotentes retidas ~24h), e a chave aqui é
 * SEMPRE rastreável por usuário e pacote (T-028 / §12.4.1).
 */

const KEY_PREFIX = 'corgly_checkout';
const FINANCIAL_KEY_PREFIX = 'corgly_billing';

/**
 * Janela de validade (expiração) do escopo idempotente auto-gerado.
 * Alinhada à retenção de chaves idempotentes do Stripe (~24h): após a janela,
 * o bucket determinístico muda e uma nova sessão é criada.
 */
export const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Formato aceito para Idempotency-Key fornecida pelo cliente. */
const CLIENT_KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;

export interface IdempotencyScope {
  /** Dono da requisição - torna a chave rastreável por usuário. */
  userId: string;
  /** Pacote/escopo da compra - torna a chave rastreável por pacote. */
  packageType: string;
}

export type FinancialIdempotencyScope = 'subscription_update' | 'admin_refund';

export interface FinancialIdempotencyResult<T> {
  result: T;
  idempotentReplay: boolean;
}

type FinancialRecordStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

interface FinancialIdempotencyRecord {
  attemptId: string;
  fingerprint: string;
  status: FinancialRecordStatus;
  resultJson?: Prisma.JsonValue | string | null;
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableNormalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

/** Hash estável (truncado) do payload para compor a chave determinística. */
export function hashPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableNormalize(payload)))
    .digest('hex')
    .slice(0, 32);
}

/** Bucket temporal determinístico - muda a cada janela (semântica de expiração). */
export function currentWindowBucket(now: number = Date.now()): number {
  return Math.floor(now / IDEMPOTENCY_WINDOW_MS);
}

/** Valida uma Idempotency-Key fornecida pelo cliente; lança AppError 400 se inválida. */
export function assertValidClientKey(clientKey: string): void {
  if (!CLIENT_KEY_RE.test(clientKey)) {
    throw new AppError(
      'PAYMENT_060',
      'Idempotency-Key inválida: use 8 a 200 caracteres [A-Za-z0-9_-].',
      400,
    );
  }
}

/**
 * Resolve a Idempotency-Key final enviada ao Stripe.
 *
 * - Cliente enviou `Idempotency-Key` válida -> namespaceia por usuário+pacote
 *   (honra a chave do cliente, mantém rastreabilidade; replay = mesma sessão).
 * - Sem chave do cliente -> deriva determinísticamente de
 *   userId + pacote + bucket-temporal + hash(payload). Repetição com o mesmo
 *   payload dentro da janela retorna a mesma sessão; payload divergente gera
 *   nova chave (nova sessão).
 */
export function resolveIdempotencyKey(
  scope: IdempotencyScope,
  clientKey: string | null | undefined,
  payload: unknown,
  now: number = Date.now(),
): string {
  if (!scope.userId) {
    throw new AppError('PAYMENT_062', 'userId obrigatório para chave idempotente.', 500);
  }

  const normalizedClientKey = clientKey?.trim();
  if (normalizedClientKey) {
    assertValidClientKey(normalizedClientKey);
    return `${KEY_PREFIX}:${scope.userId}:${scope.packageType}:${normalizedClientKey}`;
  }

  const bucket = currentWindowBucket(now);
  const ph = hashPayload(payload);
  return `${KEY_PREFIX}:${scope.userId}:${scope.packageType}:${bucket}:${ph}`;
}

export function resolveRequestIdempotencyKey(headers: Headers): string | null {
  const primary = headers.get('Idempotency-Key')?.trim() || null;
  const fallback = headers.get('X-Idempotency-Key')?.trim() || null;

  if (primary && fallback && primary !== fallback) {
    throw new AppError(
      'PAYMENT_063',
      'Headers Idempotency-Key e X-Idempotency-Key divergentes.',
      400,
    );
  }

  const key = primary ?? fallback;
  if (!key) return null;
  assertValidClientKey(key);
  return key;
}

export function buildFinancialFingerprint(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableNormalize(payload)))
    .digest('hex');
}

function parseFinancialResult<T>(value: Prisma.JsonValue | string | null | undefined): T | null {
  if (!value) return null;
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

function scopedFinancialKey(
  scope: FinancialIdempotencyScope,
  ownerId: string,
  clientKey: string,
): string {
  return `${FINANCIAL_KEY_PREFIX}:${scope}:${ownerId}:${clientKey}`;
}

export class FinancialIdempotencyService {
  private readonly idempotencyTtlMs = Number(
    process.env.BILLING_IDEMPOTENCY_TTL_MS ?? IDEMPOTENCY_WINDOW_MS,
  );

  async run<T>(
    scope: FinancialIdempotencyScope,
    ownerId: string,
    clientKey: string | null | undefined,
    payload: unknown,
    operation: (idempotencyKey: string | null) => Promise<T>,
  ): Promise<FinancialIdempotencyResult<T>> {
    const cleanKey = clientKey?.trim() || null;
    if (!cleanKey) {
      return { result: await operation(null), idempotentReplay: false };
    }

    assertValidClientKey(cleanKey);
    await this.purgeExpired();

    const idempotencyKey = scopedFinancialKey(scope, ownerId, cleanKey);
    const fingerprint = buildFinancialFingerprint({ scope, ownerId, payload });
    const attemptId = randomUUID();

    const cached = await this.findActiveRecord(idempotencyKey);
    if (cached) {
      if (cached.fingerprint !== fingerprint) {
        throw new AppError(
          'PAYMENT_064',
          'Idempotency-Key reutilizada com payload divergente.',
          409,
        );
      }

      const cachedResult = parseFinancialResult<T>(cached.resultJson);
      if (cached.status === 'COMPLETED' && cachedResult) {
        return { result: cachedResult, idempotentReplay: true };
      }

      if (cached.status === 'IN_PROGRESS') {
        throw new AppError(
          'PAYMENT_065',
          'Operação financeira já está em processamento para esta Idempotency-Key.',
          409,
        );
      }
    }

    await this.claimRecord(idempotencyKey, scope, ownerId, fingerprint, attemptId);
    const claimed = await this.findActiveRecord(idempotencyKey);
    if (!claimed || claimed.attemptId !== attemptId) {
      throw new AppError(
        'PAYMENT_065',
        'Operação financeira já está em processamento para esta Idempotency-Key.',
        409,
      );
    }

    try {
      const result = await operation(idempotencyKey);
      await this.completeRecord(idempotencyKey, attemptId, result);
      return { result, idempotentReplay: false };
    } catch (err) {
      await this.failRecord(idempotencyKey, attemptId);
      throw err;
    }
  }

  private async purgeExpired(): Promise<void> {
    await prisma.$executeRaw`DELETE FROM billing_idempotency_records WHERE expiresAt <= NOW(3)`;
  }

  private async findActiveRecord(key: string): Promise<FinancialIdempotencyRecord | null> {
    const rows = await prisma.$queryRaw<FinancialIdempotencyRecord[]>`
      SELECT attemptId, fingerprint, status, resultJson
      FROM billing_idempotency_records
      WHERE idempotencyKey = ${key} AND expiresAt > NOW(3)
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private async claimRecord(
    key: string,
    scope: FinancialIdempotencyScope,
    ownerId: string,
    fingerprint: string,
    attemptId: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + this.idempotencyTtlMs);

    await prisma.$executeRaw`
      INSERT INTO billing_idempotency_records (
        idempotencyKey, scope, ownerId, fingerprint, attemptId, status, expiresAt, createdAt, updatedAt
      )
      VALUES (${key}, ${scope}, ${ownerId}, ${fingerprint}, ${attemptId}, 'IN_PROGRESS', ${expiresAt}, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        fingerprint = IF(expiresAt <= NOW(3) OR status = 'FAILED', VALUES(fingerprint), fingerprint),
        attemptId = IF(expiresAt <= NOW(3) OR status = 'FAILED', VALUES(attemptId), attemptId),
        status = IF(expiresAt <= NOW(3) OR status = 'FAILED', VALUES(status), status),
        resultJson = IF(expiresAt <= NOW(3) OR status = 'FAILED', NULL, resultJson),
        expiresAt = IF(expiresAt <= NOW(3) OR status = 'FAILED', VALUES(expiresAt), expiresAt),
        updatedAt = NOW(3)
    `;
  }

  private async completeRecord<T>(key: string, attemptId: string, result: T): Promise<void> {
    const expiresAt = new Date(Date.now() + this.idempotencyTtlMs);
    const resultJson = JSON.stringify(result);

    await prisma.$executeRaw`
      UPDATE billing_idempotency_records
      SET status = 'COMPLETED', resultJson = ${resultJson}, expiresAt = ${expiresAt}, updatedAt = NOW(3)
      WHERE idempotencyKey = ${key} AND attemptId = ${attemptId}
    `;
  }

  private async failRecord(key: string, attemptId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + this.idempotencyTtlMs);

    await prisma.$executeRaw`
      UPDATE billing_idempotency_records
      SET status = 'FAILED', expiresAt = ${expiresAt}, updatedAt = NOW(3)
      WHERE idempotencyKey = ${key} AND attemptId = ${attemptId}
    `;
  }
}

export const financialIdempotencyService = new FinancialIdempotencyService();
