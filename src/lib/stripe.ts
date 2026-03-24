import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';

/** Lazy-initialized Stripe singleton — ENV validado via Zod no boot. */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  if (env.NODE_ENV !== 'production' && !env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    console.warn('[Stripe] WARNING: STRIPE_SECRET_KEY não começa com sk_test_ em dev/staging');
  }

  _stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' });
  return _stripe;
}
