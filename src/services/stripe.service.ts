import Stripe from 'stripe';
import type { CreateCheckoutInput, CreateSubscriptionCheckoutInput } from '@/schemas/checkout.schema';

const PRICE_MAP = {
  SINGLE: process.env.STRIPE_PRICE_SINGLE ?? '',
  PACK_5: process.env.STRIPE_PRICE_PACK_5 ?? '',
  PACK_10: process.env.STRIPE_PRICE_PACK_10 ?? '',
} as const;

const CREDITS_MAP = {
  SINGLE: 1,
  PACK_5: 5,
  PACK_10: 10,
} as const;

export class StripeService {
  private get stripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    return new Stripe(key, { apiVersion: '2026-02-25.clover' });
  }

  async createCheckoutSession(userId: string, isFirstPurchase: boolean, data: CreateCheckoutInput) {
    // TODO: Implementar via /auto-flow execute
    // 1. Lookup or create Stripe customer
    // 2. Apply 50% discount if isFirstPurchase
    // 3. Create checkout.session with metadata { userId, packageType }
    // 4. Return { url }
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async createSubscriptionCheckout(userId: string, data: CreateSubscriptionCheckoutInput) {
    // TODO: Implementar via /auto-flow execute
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async cancelSubscription(stripeSubscriptionId: string) {
    // TODO: Implementar via /auto-flow execute
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    // TODO: Implementar via /auto-flow execute
    // Events to handle:
    //   checkout.session.completed → creditService.createBatch + Payment
    //   invoice.paid → monthly CreditBatch
    //   customer.subscription.updated → update Subscription.status
    //   customer.subscription.deleted → CANCELLED
    //   invoice.payment_failed → PAST_DUE
    throw new Error('Not implemented - run /auto-flow execute');
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  }
}

export const stripeService = new StripeService();
