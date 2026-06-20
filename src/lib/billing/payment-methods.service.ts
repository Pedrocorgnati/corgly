import 'server-only';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { AppError } from '@/lib/errors';

export interface SetupIntentResult {
  setupIntentId: string;
  clientSecret: string;
}

export interface PaymentMethodSummary {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  funding: string | null;
  isDefault: boolean;
  createdAt: string | null;
}

export interface PaymentMethodsResult {
  items: PaymentMethodSummary[];
  defaultPaymentMethodId: string | null;
}

function resolveDefaultPaymentMethodId(customer: Stripe.Customer | Stripe.DeletedCustomer): string | null {
  if ('deleted' in customer && customer.deleted) return null;

  const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;
  if (!defaultPaymentMethod) return null;

  return typeof defaultPaymentMethod === 'string'
    ? defaultPaymentMethod
    : defaultPaymentMethod.id;
}

function resolveOwnerCustomerId(paymentMethod: Stripe.PaymentMethod): string | null {
  const { customer } = paymentMethod;
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

function serializePaymentMethod(
  paymentMethod: Stripe.PaymentMethod,
  defaultPaymentMethodId: string | null,
): PaymentMethodSummary | null {
  if (paymentMethod.type !== 'card' || !paymentMethod.card) return null;

  return {
    id: paymentMethod.id,
    brand: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
    expMonth: paymentMethod.card.exp_month,
    expYear: paymentMethod.card.exp_year,
    funding: paymentMethod.card.funding ?? null,
    isDefault: paymentMethod.id === defaultPaymentMethodId,
    createdAt: paymentMethod.created
      ? new Date(paymentMethod.created * 1000).toISOString()
      : null,
  };
}

export class PaymentMethodsService {
  private async getStripeCustomerId(userId: string): Promise<string> {
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

    return user.stripeCustomerId;
  }

  async createSetupIntentForUser(userId: string): Promise<SetupIntentResult> {
    const stripeCustomerId = await this.getStripeCustomerId(userId);
    const setupIntent = await getStripe().setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    });

    if (!setupIntent.client_secret) {
      throw new AppError(
        'PAYMENT_071',
        'Não foi possível preparar a inclusão do método de pagamento.',
        502,
      );
    }

    return {
      setupIntentId: setupIntent.id,
      clientSecret: setupIntent.client_secret,
    };
  }

  async listForUser(userId: string): Promise<PaymentMethodsResult> {
    const stripeCustomerId = await this.getStripeCustomerId(userId);
    const stripe = getStripe();

    const [paymentMethods, customer] = await Promise.all([
      stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card',
      }),
      stripe.customers.retrieve(stripeCustomerId),
    ]);

    const defaultPaymentMethodId = resolveDefaultPaymentMethodId(customer);
    const items = paymentMethods.data
      .map((paymentMethod) => serializePaymentMethod(paymentMethod, defaultPaymentMethodId))
      .filter((paymentMethod): paymentMethod is PaymentMethodSummary => Boolean(paymentMethod));

    return {
      items,
      defaultPaymentMethodId,
    };
  }

  async setDefaultForUser(
    userId: string,
    paymentMethodId: string,
  ): Promise<PaymentMethodsResult> {
    const stripeCustomerId = await this.getStripeCustomerId(userId);
    const stripe = getStripe();
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const ownerCustomerId = resolveOwnerCustomerId(paymentMethod);

    if (ownerCustomerId && ownerCustomerId !== stripeCustomerId) {
      throw new AppError(
        'PAYMENT_072',
        'Método de pagamento não pertence ao customer autenticado.',
        403,
      );
    }

    if (!ownerCustomerId) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId,
      });
    }

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return this.listForUser(userId);
  }
}

export const paymentMethodsService = new PaymentMethodsService();
