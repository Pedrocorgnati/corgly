// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const tx = {
    cookieConsent: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    cookieConsentHistory: {
      create: vi.fn(),
    },
  };

  return {
    prisma: {
      ...tx,
      $transaction: vi.fn((callback) => callback(tx)),
    },
  };
});

import { prisma } from '@/lib/prisma';
import { getEffectiveConsent, upsertConsentPreferences } from '../consent.service';

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  cookieConsent: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  cookieConsentHistory: {
    create: ReturnType<typeof vi.fn>;
  };
};

describe('consent.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna preferencias restritivas quando nao ha consentimento registrado', async () => {
    mockPrisma.cookieConsent.findFirst.mockResolvedValue(null);

    await expect(getEffectiveConsent({ sessionFingerprint: 'anon-session-123' })).resolves.toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
      consentVersion: null,
      legalTextVersion: null,
      source: null,
      updatedAt: null,
    });

    expect(mockPrisma.cookieConsent.findFirst).toHaveBeenCalledWith({
      where: { sessionFingerprint: 'anon-session-123' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('cria consentimento anonimo e registra historico na mesma transacao', async () => {
    const now = new Date('2026-05-28T12:00:00.000Z');
    mockPrisma.cookieConsent.findFirst.mockResolvedValue(null);
    mockPrisma.cookieConsent.create.mockResolvedValue({
      id: 'consent-1',
      userId: null,
      sessionFingerprint: 'anon-session-123',
      essentialAccepted: true,
      analyticsAccepted: true,
      marketingAccepted: false,
      consentVersion: '2.0',
      legalTextVersion: '2026.05',
      source: 'COOKIE_BANNER',
      updatedAt: now,
    });

    const result = await upsertConsentPreferences({
      sessionFingerprint: 'anon-session-123',
      preferences: {
        necessary: true,
        analytics: true,
        marketing: false,
      },
      consentVersion: '2.0',
      legalTextVersion: '2026.05',
      source: 'COOKIE_BANNER',
      metadata: { region: 'BR' },
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.cookieConsent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionFingerprint: 'anon-session-123',
        analyticsAccepted: true,
        marketingAccepted: false,
        consentVersion: '2.0',
        legalTextVersion: '2026.05',
      }),
    });
    expect(mockPrisma.cookieConsentHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consentId: 'consent-1',
        sessionFingerprint: 'anon-session-123',
        analyticsAccepted: true,
        marketingAccepted: false,
        metadata: { region: 'BR' },
      }),
    });
    expect(result).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
      consentVersion: '2.0',
      legalTextVersion: '2026.05',
      source: 'COOKIE_BANNER',
      updatedAt: now,
    });
  });

  it('atualiza o estado corrente sem apagar historico anterior', async () => {
    mockPrisma.cookieConsent.findFirst.mockResolvedValue({ id: 'consent-1' });
    mockPrisma.cookieConsent.update.mockResolvedValue({
      id: 'consent-1',
      userId: 'user-1',
      sessionFingerprint: null,
      essentialAccepted: true,
      analyticsAccepted: false,
      marketingAccepted: true,
      consentVersion: '2.1',
      legalTextVersion: '2026.05',
      source: 'ACCOUNT_SETTINGS',
      updatedAt: new Date('2026-05-28T13:00:00.000Z'),
    });

    await upsertConsentPreferences({
      userId: 'user-1',
      preferences: {
        necessary: true,
        analytics: false,
        marketing: true,
      },
      consentVersion: '2.1',
      legalTextVersion: '2026.05',
      source: 'ACCOUNT_SETTINGS',
    });

    expect(mockPrisma.cookieConsent.update).toHaveBeenCalledWith({
      where: { id: 'consent-1' },
      data: expect.objectContaining({
        analyticsAccepted: false,
        marketingAccepted: true,
        consentVersion: '2.1',
      }),
    });
    expect(mockPrisma.cookieConsentHistory.create).toHaveBeenCalledOnce();
  });
});
