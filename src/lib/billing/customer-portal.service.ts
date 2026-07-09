import 'server-only';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { CUSTOMER_PORTAL_DEFAULT_RETURN_PATH } from '@/lib/billing/customer-portal.config';

// Modo de integração e path de retorno são centralizados em customer-portal.config.ts
// (decisão canônica: ADR-0003 — redirect, sem embed).
const DEFAULT_RETURN_PATH = CUSTOMER_PORTAL_DEFAULT_RETURN_PATH;

function resolveSafeReturnUrl(returnTo?: string | null): string {
  const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);

  if (!returnTo) {
    return new URL(DEFAULT_RETURN_PATH, appUrl).toString();
  }

  try {
    const candidate = new URL(returnTo, appUrl);
    const isSameOrigin = candidate.origin === appUrl.origin;
    const isRelativeInput = returnTo.startsWith('/') && !returnTo.startsWith('//');

    if (!isSameOrigin || !isRelativeInput || returnTo.includes('\\')) {
      return new URL(DEFAULT_RETURN_PATH, appUrl).toString();
    }

    return candidate.toString();
  } catch {
    return new URL(DEFAULT_RETURN_PATH, appUrl).toString();
  }
}

export interface CustomerPortalSessionResult {
  url: string;
  sessionId: string;
  returnUrl: string;
}

export class CustomerPortalService {
  async createSessionForUser(
    userId: string,
    returnTo?: string | null,
  ): Promise<CustomerPortalSessionResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user) {
      throw new AppError('AUTH_002', 'Usuário não encontrado.', 404);
    }

    if (!user.stripeCustomerId) {
      throw new AppError(
        'PAYMENT_070',
        'Não encontramos um customer Stripe para sua conta. Fale com o suporte para revisar sua assinatura.',
        409,
      );
    }

    const returnUrl = resolveSafeReturnUrl(returnTo);
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return {
      url: session.url,
      sessionId: session.id,
      returnUrl,
    };
  }
}

export const customerPortalService = new CustomerPortalService();
