// @vitest-environment node
import { CronService } from '../cron.service';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const prismaMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  creditBatchUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: prismaMocks.queryRaw,
    creditBatch: {
      update: prismaMocks.creditBatchUpdate,
    },
    session: {
      updateMany: prismaMocks.sessionUpdateMany,
      findMany:   prismaMocks.sessionFindMany,
      update:     prismaMocks.sessionUpdate,
    },
  },
}));

// ─── Mock EmailService ────────────────────────────────────────────────────────
const emailMocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('@/services/email.service', () => ({
  emailService: {
    send: emailMocks.send,
  },
}));

function makeExpiring(daysFromNow: number, lastEmailSent: Date | null = null) {
  const expiresAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return {
    id: `batch-${daysFromNow}d`,
    userId: 'user-1',
    totalCredits: 5,
    usedCredits: 2,
    expiresAt,
    lastExpiryEmailSent: lastEmailSent,
    email: 'test@example.com',
    name: 'Test User',
    preferredLanguage: 'PT_BR',
  };
}

describe('CronService.runCreditExpiration', () => {
  let service: CronService;

  beforeEach(() => {
    service = new CronService();
    vi.clearAllMocks();
    emailMocks.send.mockResolvedValue(undefined);
    prismaMocks.creditBatchUpdate.mockResolvedValue({});
  });

  // Caso 1: batch expira em 5 dias → envia CREDIT_EXPIRY_WARNING + atualiza lastExpiryEmailSent
  it('caso 1: batch expirando em 5 dias → CREDIT_EXPIRY_WARNING enviado e lastExpiryEmailSent atualizado', async () => {
    // queryRaw chamado 3x: expiring7d, expiring30d, expired
    prismaMocks.queryRaw
      .mockResolvedValueOnce([makeExpiring(5)]) // expiring ≤7d
      .mockResolvedValueOnce([]) // expiring 8-30d
      .mockResolvedValueOnce([]); // expired

    const result = await service.runCreditExpiration();

    expect(emailMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CREDIT_EXPIRY_WARNING',
        to: 'test@example.com',
        data: expect.objectContaining({ credits: 3, expiresIn: '5 dias' }),
      }),
    );

    expect(prismaMocks.creditBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-5d' },
        data: { lastExpiryEmailSent: expect.any(Date) },
      }),
    );

    expect(result.notifiedExpiring7d).toBe(1);
    expect(result.notifiedExpiring30d).toBe(0);
  });

  // Caso 2: idempotência — batch com lastExpiryEmailSent = hoje → não reenvia
  it('caso 2: idempotência — lastExpiryEmailSent hoje → email NÃO reenviado', async () => {
    const todayMidnight = new Date();
    const batchWithTodayEmail = makeExpiring(5, todayMidnight);

    prismaMocks.queryRaw
      .mockResolvedValueOnce([batchWithTodayEmail])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.runCreditExpiration();

    expect(emailMocks.send).not.toHaveBeenCalled();
    expect(result.notifiedExpiring7d).toBe(0);
  });

  // Caso 3: batch expira em 15 dias → notifiedExpiring30d
  it('caso 3: batch expirando em 15 dias → notifiedExpiring30d incrementado', async () => {
    prismaMocks.queryRaw
      .mockResolvedValueOnce([]) // expiring ≤7d
      .mockResolvedValueOnce([makeExpiring(15)]) // expiring 8-30d
      .mockResolvedValueOnce([]); // expired

    const result = await service.runCreditExpiration();

    expect(emailMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresIn: '15 dias' }),
      }),
    );
    expect(result.notifiedExpiring30d).toBe(1);
  });

  // Caso 4: batch já expirado com saldo → contado em `expired`, sem email
  it('caso 4: batch expirado com saldo → expired contado, nenhum email enviado', async () => {
    prismaMocks.queryRaw
      .mockResolvedValueOnce([]) // expiring ≤7d
      .mockResolvedValueOnce([]) // expiring 8-30d
      .mockResolvedValueOnce([{ id: 'old-batch', totalCredits: 10, usedCredits: 3 }]); // expired

    const result = await service.runCreditExpiration();

    expect(emailMocks.send).not.toHaveBeenCalled();
    expect(result.expired).toBe(1);
  });

  // Caso adicional: todos batches expirados já consumidos → expired = 0
  it('caso adicional: batches expirados com usedCredits == totalCredits → expired = 0 (filtrado pelo SQL)', async () => {
    prismaMocks.queryRaw
      .mockResolvedValueOnce([]) // expiring ≤7d
      .mockResolvedValueOnce([]) // expiring 8-30d
      .mockResolvedValueOnce([]); // SQL já filtra usedCredits < totalCredits

    const result = await service.runCreditExpiration();

    expect(result.expired).toBe(0);
    expect(result.notifiedExpiring7d).toBe(0);
    expect(result.notifiedExpiring30d).toBe(0);
  });

  // Caso adicional: nenhum batch → resultado zerado sem erros
  it('caso adicional: nenhum batch → resultado zerado, sem erros', async () => {
    prismaMocks.queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.runCreditExpiration();

    expect(result).toEqual({ expired: 0, notifiedExpiring7d: 0, notifiedExpiring30d: 0 });
    expect(emailMocks.send).not.toHaveBeenCalled();
  });
});

// ── runAutoConfirmation ──────────────────────────────────────────────────────

describe('CronService.runAutoConfirmation', () => {
  let service: CronService;

  beforeEach(() => {
    service = new CronService();
    vi.clearAllMocks();
    prismaMocks.sessionFindMany.mockResolvedValue([]);
  });

  it('should mark expired sessions as COMPLETED', async () => {
    prismaMocks.sessionUpdateMany.mockResolvedValue({ count: 3 });

    const result = await service.runAutoConfirmation();
    expect(result.confirmed).toBe(3);
  });

  it('should return { confirmed: 0 } when no expired sessions', async () => {
    prismaMocks.sessionUpdateMany.mockResolvedValue({ count: 0 });

    const result = await service.runAutoConfirmation();
    expect(result.confirmed).toBe(0);
  });
});
