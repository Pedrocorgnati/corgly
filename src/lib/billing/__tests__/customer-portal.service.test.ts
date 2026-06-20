import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';

const { sessionsCreate, userFindUnique } = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_APP_URL: 'https://app.corgly.test',
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    billingPortal: {
      sessions: {
        create: sessionsCreate,
      },
    },
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
    },
  },
}));

import { customerPortalService } from '../customer-portal.service';

describe('CustomerPortalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_123' });
    sessionsCreate.mockResolvedValue({ id: 'bps_123', url: 'https://billing.stripe.com/p/session' });
  });

  it('cria sessão do Customer Portal para customer autenticado', async () => {
    const result = await customerPortalService.createSessionForUser(
      'user-1',
      '/billing/subscription?portal=returned',
    );

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { stripeCustomerId: true },
    });
    expect(sessionsCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app.corgly.test/billing/subscription?portal=returned',
    });
    expect(result).toEqual({
      url: 'https://billing.stripe.com/p/session',
      sessionId: 'bps_123',
      returnUrl: 'https://app.corgly.test/billing/subscription?portal=returned',
    });
  });

  it('força return_url seguro quando returnTo aponta para outro origin', async () => {
    await customerPortalService.createSessionForUser('user-1', 'https://evil.test/phish');

    expect(sessionsCreate).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app.corgly.test/billing/subscription',
    });
  });

  it('rejeita customer ausente com erro rastreável para CTA de suporte', async () => {
    userFindUnique.mockResolvedValue({ stripeCustomerId: null });

    await expect(customerPortalService.createSessionForUser('user-1')).rejects.toMatchObject({
      code: 'PAYMENT_070',
      status: 409,
    } satisfies Partial<AppError>);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
