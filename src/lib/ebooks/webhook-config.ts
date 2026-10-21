import 'server-only';

// Constantes globais do mecanismo de webhook de ebooks (D-B10, D-B11).

// Revogacao do token de acesso em reembolso total (evidence/item-001.md secao
// 5.7: acesso permanente, sem limite de downloads, revoga em reembolso total).
export const EBOOK_TOKEN_REVOKE_ON_REFUND = true;

// Revogacao do token de acesso em disputa (mesma origem: secao 5.7).
export const EBOOK_TOKEN_REVOKE_ON_DISPUTE = true;

// Limite de corpo do endpoint dedicado de webhook de ebooks (D-B3).
export const EBOOK_WEBHOOK_MAX_BODY_BYTES = 262_144;

// Lease do claim em PROCESSING: worker morto libera o evento para reclaim (D-B6).
export const EBOOK_WEBHOOK_LEASE_MS = 300_000;

// Tipos de evento inscritos no endpoint (D-B11). `refund.created` nao entra:
// `charge.refunded` ja traz o total acumulado de reembolso.
export const EBOOK_WEBHOOK_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'charge.refunded',
  'charge.dispute.created',
] as const;

export type EbookWebhookEventType = (typeof EBOOK_WEBHOOK_EVENT_TYPES)[number];
