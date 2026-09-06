import { describe, it, expect } from 'vitest';
import { createUser, createSession, createCreditBatch } from '@/test/factories';
import { UserRole, SessionStatus, CreditType, CreditStatus } from '@/types/enums';

describe('createUser', () => {
  it('cria usuário com valores padrão', () => {
    const user = createUser();

    expect(user.id).toBeDefined();
    expect(user.name).toBe('Test User');
    expect(user.role).toBe(UserRole.STUDENT);
    expect(user.timezone).toBe('America/Sao_Paulo');
    expect(user.country).toBe('BR');
    expect(user.creditBalance).toBe(0);
    expect(user.isFirstPurchase).toBe(true);
    expect(user.streakCount).toBe(0);
    expect(user.emailVerified).toBe(false);
    expect(user.email).toContain('@example.com');
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });

  it('aplica overrides', () => {
    const user = createUser({
      name: 'Maria',
      role: UserRole.ADMIN,
      creditBalance: 10,
    });

    expect(user.name).toBe('Maria');
    expect(user.role).toBe(UserRole.ADMIN);
    expect(user.creditBalance).toBe(10);
  });

  it('gera IDs únicos', () => {
    const u1 = createUser();
    const u2 = createUser();
    expect(u1.id).not.toBe(u2.id);
  });
});

describe('createSession', () => {
  it('cria sessão com valores padrão no shape canônico SessionWithMeta', () => {
    const session = createSession();

    expect(session.id).toBeDefined();
    expect(session.studentId).toBeDefined();
    expect(session.availabilitySlotId).toBeDefined();
    expect(session.status).toBe(SessionStatus.SCHEDULED);
    // startAt/endAt são ISO string (não Date): é o que a API emite.
    expect(typeof session.startAt).toBe('string');
    expect(typeof session.endAt).toBe('string');
    expect(session.startAt).toBe(new Date(session.startAt).toISOString());
    expect(session.endAt).toBe(new Date(session.endAt).toISOString());
    // Duração padrão de 60 min — não existe mais campo `durationMinutes`.
    expect(
      new Date(session.endAt).getTime() - new Date(session.startAt).getTime(),
    ).toBe(60 * 60 * 1000);
    expect(session.creditBatchId).toBeNull();
    expect(session.isRecurring).toBe(false);
    expect(session.recurringPatternId).toBeNull();
    expect(session.cancelledAt).toBeNull();
    expect(session.cancelledBy).toBeNull();
    expect(session.completedAt).toBeNull();
    expect(session.extendedBy).toBeNull();
    expect(session.reminderSentAt).toBeNull();
    expect(session.rescheduleRequestSlotId).toBeNull();
    expect(session.createdAt).toBeDefined();
    expect(session.updatedAt).toBeDefined();
  });

  it('endAt é posterior a startAt', () => {
    const session = createSession();
    expect(new Date(session.endAt).getTime()).toBeGreaterThan(
      new Date(session.startAt).getTime(),
    );
  });

  it('aplica overrides de status', () => {
    const session = createSession({ status: SessionStatus.COMPLETED });
    expect(session.status).toBe(SessionStatus.COMPLETED);
  });

  it('aceita startAt customizado (Date) e normaliza para ISO', () => {
    const customDate = new Date('2025-06-15T14:00:00Z');
    const session = createSession({ startAt: customDate });
    expect(session.startAt).toBe(customDate.toISOString());
    expect(session.endAt).toBe(new Date('2025-06-15T15:00:00Z').toISOString());
  });

  it('rejeita janela invertida', () => {
    expect(() =>
      createSession({
        startAt: '2025-06-15T14:00:00Z',
        endAt: '2025-06-15T13:00:00Z',
      }),
    ).toThrow(/startAt must be before endAt/);
  });

  it('gera IDs únicos', () => {
    const s1 = createSession();
    const s2 = createSession();
    expect(s1.id).not.toBe(s2.id);
  });
});

describe('createCreditBatch', () => {
  it('cria lote de créditos com valores padrão', () => {
    const credit = createCreditBatch();

    expect(credit.id).toBeDefined();
    expect(credit.studentId).toBeDefined();
    expect(credit.type).toBe(CreditType.PACK_5);
    expect(credit.status).toBe(CreditStatus.ACTIVE);
    expect(credit.quantity).toBe(5);
    expect(credit.usedQuantity).toBe(0);
    expect(credit.expiresAt).toBeDefined();
    expect(credit.createdAt).toBeDefined();
    expect(credit.updatedAt).toBeDefined();
  });

  it('aplica overrides', () => {
    const credit = createCreditBatch({
      type: CreditType.PACK_10,
      quantity: 10,
      status: CreditStatus.EXPIRED,
    });

    expect(credit.type).toBe(CreditType.PACK_10);
    expect(credit.quantity).toBe(10);
    expect(credit.status).toBe(CreditStatus.EXPIRED);
  });

  it('expiresAt está no futuro', () => {
    const credit = createCreditBatch();
    const expiresAt = new Date(credit.expiresAt);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('gera IDs únicos', () => {
    const c1 = createCreditBatch();
    const c2 = createCreditBatch();
    expect(c1.id).not.toBe(c2.id);
  });
});
