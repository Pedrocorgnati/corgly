import 'server-only';

import { randomUUID } from 'node:crypto';

import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { createEbookEmailSender } from '@/services/ebook-email.service';

import { generateEbookAccessToken } from './access-token';
import { getEbookBySlug } from './catalog';
import { resolveStripeMode } from './checkout';
import { EbookConfigError, EbookFulfillmentError } from './errors';
import { fulfillEbookCheckoutSession, type EbookFulfillmentDeps } from './fulfillment';
import {
  notifyEbookAsyncPaymentFailed,
  notifyEbookRefund,
  recordEbookDispute,
} from './fulfillment-notify';
import { checkEbookPdf } from './pdf-check';
import { resolveEbooksPrivateDir } from './private-dir';
import type { EbookWebhookPorts } from './webhook-ports';

/**
 * Adapta o nucleo do fulfillment ao contrato `EbookWebhookPorts` (D-C11).
 *
 * - `fulfillCheckoutSession` retorna void para qualquer resultado do nucleo:
 *   `needs_review` ja foi persistido no pedido e nao lanca.
 * - Todo erro do nucleo e das notificacoes e relancado sem alteracao, para o
 *   `scheduleTracked` de `webhook.ts` gravar FAILED no ledger.
 * - Nenhuma port marca o ledger do webhook.
 */
export function createEbookFulfillmentPorts(deps: EbookFulfillmentDeps): EbookWebhookPorts {
  return {
    async fulfillCheckoutSession({ checkoutSessionId }): Promise<void> {
      await fulfillEbookCheckoutSession({ checkoutSessionId, trigger: 'webhook' }, deps);
    },
    async notifyAsyncPaymentFailed({ checkoutSessionId, eventId }): Promise<void> {
      await notifyEbookAsyncPaymentFailed({ checkoutSessionId, eventId }, deps);
    },
    async notifyRefund({ orderId, eventId, full }): Promise<void> {
      await notifyEbookRefund({ orderId, eventId, full }, deps);
    },
    async notifyDispute({ orderId, eventId }): Promise<void> {
      await recordEbookDispute({ orderId, eventId }, deps);
    },
  };
}

/**
 * Deps de producao. Nunca lanca: a rota monta as ports a cada request antes da
 * assinatura e do ledger. `RESEND_API_KEY`, `EMAIL_FROM` e `EBOOKS_PRIVATE_DIR`
 * sao conferidos so no uso (pre-envio e `checkPdf`).
 */
export function buildDefaultEbookFulfillmentDeps(): EbookFulfillmentDeps {
  return {
    prisma,
    // getStripe() e preguicoso: so instancia o SDK no primeiro retrieve
    stripe: {
      checkout: {
        sessions: {
          retrieve: ((...args: Parameters<EbookFulfillmentDeps['stripe']['checkout']['sessions']['retrieve']>) =>
            getStripe().checkout.sessions.retrieve(
              ...args,
            )) as EbookFulfillmentDeps['stripe']['checkout']['sessions']['retrieve'],
        },
      },
    },
    catalog: { getBySlug: getEbookBySlug },
    priceIdFor: (entry) => process.env[entry.stripePriceEnv[resolveStripeMode(env.STRIPE_SECRET_KEY)]],
    email: createEbookEmailSender({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? '',
    }),
    config: {
      resendApiKey: process.env.RESEND_API_KEY ?? '',
      emailFrom: process.env.EMAIL_FROM ?? '',
      appUrl: env.NEXT_PUBLIC_APP_URL,
    },
    async checkPdf(entry): Promise<void> {
      let privateDir: string;
      try {
        privateDir = resolveEbooksPrivateDir();
      } catch (err) {
        if (err instanceof EbookConfigError) {
          throw new EbookFulfillmentError(
            'EBOOK_FULFILLMENT_CONFIG_MISSING',
            `Diretorio privado dos PDFs nao configurado (${err.code}).`,
            { transient: true },
          );
        }
        throw err;
      }
      await checkEbookPdf(entry, privateDir);
    },
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    randomUUID: () => randomUUID(),
    generateToken: generateEbookAccessToken,
  };
}
