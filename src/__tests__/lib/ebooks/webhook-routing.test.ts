// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';

import { routeEbookWebhookEvent } from '@/lib/ebooks/webhook-routing';

/** Evento falso tipado como Stripe.Event so no limite do modulo de teste. */
function fakeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: 'evt_fake',
    object: 'event',
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

const SESSION_EBOOK = {
  id: 'cs_1',
  object: 'checkout.session',
  metadata: { kind: 'ebook', ebook_slug: 'qualquer' },
};

describe('routeEbookWebhookEvent: fulfillment', () => {
  it('checkout.session.completed de ebook devolve fulfill com o tipo do evento', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('checkout.session.completed', SESSION_EBOOK),
    );

    expect(action).toEqual({
      type: 'fulfill',
      checkoutSessionId: 'cs_1',
      eventType: 'checkout.session.completed',
    });
  });

  it('checkout.session.async_payment_succeeded de ebook devolve fulfill com o tipo do evento', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('checkout.session.async_payment_succeeded', SESSION_EBOOK),
    );

    expect(action).toEqual({
      type: 'fulfill',
      checkoutSessionId: 'cs_1',
      eventType: 'checkout.session.async_payment_succeeded',
    });
  });

  it('checkout.session.async_payment_failed de ebook devolve notify_async_failed', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('checkout.session.async_payment_failed', SESSION_EBOOK),
    );

    expect(action).toEqual({
      type: 'notify_async_failed',
      checkoutSessionId: 'cs_1',
    });
  });
});

describe('routeEbookWebhookEvent: ignored not_ebook', () => {
  it('checkout.session.completed sem metadata devolve not_ebook', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('checkout.session.completed', { id: 'cs_1', object: 'checkout.session' }),
    );

    expect(action).toEqual({ type: 'ignored', reason: 'not_ebook' });
  });

  it('checkout.session.completed com kind de outro produto devolve not_ebook', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('checkout.session.completed', {
        id: 'cs_1',
        object: 'checkout.session',
        metadata: { kind: 'credits' },
      }),
    );

    expect(action).toEqual({ type: 'ignored', reason: 'not_ebook' });
  });

  it('checkout.session.async_payment_failed com kind diferente devolve not_ebook', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('checkout.session.async_payment_failed', {
        id: 'cs_1',
        object: 'checkout.session',
        metadata: { kind: 'credits' },
      }),
    );

    expect(action).toEqual({ type: 'ignored', reason: 'not_ebook' });
  });
});

describe('routeEbookWebhookEvent: refund', () => {
  it('charge.refunded total devolve refund com full true', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('charge.refunded', {
        id: 'ch_1',
        object: 'charge',
        payment_intent: 'pi_1',
        amount_refunded: 1500,
        refunded: true,
      }),
    );

    expect(action).toEqual({
      type: 'refund',
      paymentIntentId: 'pi_1',
      amountRefunded: 1500,
      full: true,
    });
  });

  it('charge.refunded parcial devolve refund com full false', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('charge.refunded', {
        id: 'ch_1',
        object: 'charge',
        payment_intent: 'pi_1',
        amount_refunded: 500,
        refunded: false,
      }),
    );

    expect(action).toEqual({
      type: 'refund',
      paymentIntentId: 'pi_1',
      amountRefunded: 500,
      full: false,
    });
  });

  it('charge.refunded com payment_intent expandido extrai o id', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('charge.refunded', {
        id: 'ch_2',
        object: 'charge',
        payment_intent: { id: 'pi_2', object: 'payment_intent' },
        amount_refunded: 1000,
        refunded: true,
      }),
    );

    expect(action).toEqual({
      type: 'refund',
      paymentIntentId: 'pi_2',
      amountRefunded: 1000,
      full: true,
    });
  });

  it('charge.refunded com payment_intent null devolve no_payment_intent', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('charge.refunded', {
        id: 'ch_3',
        object: 'charge',
        payment_intent: null,
        amount_refunded: 900,
        refunded: true,
      }),
    );

    expect(action).toEqual({ type: 'ignored', reason: 'no_payment_intent' });
  });
});

describe('routeEbookWebhookEvent: dispute', () => {
  it('charge.dispute.created devolve dispute com id e status', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('charge.dispute.created', {
        id: 'dp_1',
        object: 'dispute',
        payment_intent: 'pi_3',
        status: 'needs_response',
      }),
    );

    expect(action).toEqual({
      type: 'dispute',
      paymentIntentId: 'pi_3',
      disputeId: 'dp_1',
      disputeStatus: 'needs_response',
    });
  });

  it('charge.dispute.created com payment_intent null devolve no_payment_intent', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('charge.dispute.created', {
        id: 'dp_2',
        object: 'dispute',
        payment_intent: null,
        status: 'needs_response',
      }),
    );

    expect(action).toEqual({ type: 'ignored', reason: 'no_payment_intent' });
  });
});

describe('routeEbookWebhookEvent: ignored unsupported_event', () => {
  it('refund.created devolve unsupported_event (nao esta na lista de eventos)', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('refund.created', { id: 're_1', object: 'refund', payment_intent: 'pi_1' }),
    );

    expect(action).toEqual({ type: 'ignored', reason: 'unsupported_event' });
  });

  it('tipo desconhecido devolve unsupported_event', () => {
    const action = routeEbookWebhookEvent(
      fakeEvent('customer.created', { id: 'cus_1', object: 'customer' }),
    );

    expect(action).toEqual({ type: 'ignored', reason: 'unsupported_event' });
  });
});

describe('routeEbookWebhookEvent: pureza', () => {
  it('nao muta o evento e devolve resultado estavel entre chamadas', () => {
    const event = fakeEvent('charge.refunded', {
      id: 'ch_puro',
      object: 'charge',
      payment_intent: { id: 'pi_puro', object: 'payment_intent' },
      amount_refunded: 1000,
      refunded: true,
    });
    const snapshot = structuredClone(event);

    const first = routeEbookWebhookEvent(event);
    const second = routeEbookWebhookEvent(event);

    expect(second).toEqual(first);
    expect(event).toEqual(snapshot);
  });
});
