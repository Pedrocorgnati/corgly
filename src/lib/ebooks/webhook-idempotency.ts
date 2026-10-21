import 'server-only';

import { Prisma, PrismaClient } from '@prisma/client';

import { EBOOK_WEBHOOK_LEASE_MS } from '@/lib/ebooks/webhook-config';

/**
 * Idempotencia do webhook de ebooks por `event.id` no ledger `EbookWebhookEvent` (D-B6).
 *
 * Contrato:
 * - A concorrencia e resolvida apenas pela unique de `eventId` e pelo
 *   `updateMany` condicional; nunca por ler-depois-gravar.
 * - O status RECEIVED nao e usado por este endpoint: o claim ja nasce em
 *   PROCESSING e so o nucleo do webhook chama os `markEbookWebhook*`.
 * - `checkoutSessionId` e opcional e vira NULL em `charge.*`, disputas e tipos
 *   fora da lista (a coluna ja e anulavel).
 */

export type EbookWebhookClaimResult = 'claimed' | 'duplicate' | 'in_progress';

/** Dependencias reduzidas do ledger; o `Pick` permite fake enxuto em teste. */
export interface EbookWebhookLedgerDeps {
  prisma: Pick<PrismaClient, 'ebookWebhookEvent'>;
  now: () => Date;
}

export type EbookWebhookIgnoredReason =
  | 'not_ebook'
  | 'unsupported_event'
  | 'no_payment_intent';

/**
 * Reivindica o evento: create em PROCESSING; em P2002 decide por
 * duplicate/in_progress ou faz reclaim condicional de FAILED/PROCESSING vencido.
 */
export async function claimEbookWebhookEvent(
  input: { eventId: string; type: string; checkoutSessionId?: string | null },
  deps: EbookWebhookLedgerDeps,
): Promise<EbookWebhookClaimResult> {
  const now = deps.now();
  const cutoff = new Date(now.getTime() - EBOOK_WEBHOOK_LEASE_MS);

  try {
    await deps.prisma.ebookWebhookEvent.create({
      data: {
        eventId: input.eventId,
        type: input.type,
        checkoutSessionId: input.checkoutSessionId ?? null,
        status: 'PROCESSING',
        claimedAt: now,
        attempts: 1,
      },
    });
    return 'claimed';
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error;
    }
  }

  const existing = await deps.prisma.ebookWebhookEvent.findUnique({
    where: { eventId: input.eventId },
    select: { status: true, claimedAt: true },
  });

  // Linha ausente na leitura: corrida de worker ou limpeza externa; a Stripe
  // reentrega e o proximo claim decide.
  if (!existing) {
    return 'in_progress';
  }

  if (existing.status === 'PROCESSED' || existing.status === 'IGNORED') {
    return 'duplicate';
  }

  // PROCESSING dentro do lease pertence a outro worker. PROCESSING com
  // claimedAt null nao casa o `lt` do updateMany abaixo e tambem termina em
  // in_progress, sem logica extra.
  if (
    existing.status === 'PROCESSING' &&
    existing.claimedAt !== null &&
    existing.claimedAt.getTime() >= cutoff.getTime()
  ) {
    return 'in_progress';
  }

  const reclaimed = await deps.prisma.ebookWebhookEvent.updateMany({
    where: {
      eventId: input.eventId,
      OR: [{ status: 'FAILED' }, { status: 'PROCESSING', claimedAt: { lt: cutoff } }],
    },
    data: {
      status: 'PROCESSING',
      claimedAt: now,
      attempts: { increment: 1 },
    },
  });

  return reclaimed.count === 1 ? 'claimed' : 'in_progress';
}

/** Marca o evento como concluido e limpa a mensagem de erro anterior. */
export async function markEbookWebhookProcessed(
  input: { eventId: string },
  deps: EbookWebhookLedgerDeps,
): Promise<void> {
  await deps.prisma.ebookWebhookEvent.update({
    where: { eventId: input.eventId },
    data: { status: 'PROCESSED', processedAt: deps.now(), errorMessage: null },
  });
}

/**
 * Marca o evento como ignorado; o motivo vai para `errorMessage` no formato
 * literal `ignored:{reason}` (o ledger nao tem coluna de motivo).
 */
export async function markEbookWebhookIgnored(
  input: { eventId: string; reason: EbookWebhookIgnoredReason },
  deps: EbookWebhookLedgerDeps,
): Promise<void> {
  await deps.prisma.ebookWebhookEvent.update({
    where: { eventId: input.eventId },
    data: {
      status: 'IGNORED',
      processedAt: deps.now(),
      errorMessage: `ignored:${input.reason}`,
    },
  });
}

/** Marca o evento como FAILED com a mensagem sanitizada (sem segredo/email). */
export async function markEbookWebhookFailed(
  input: { eventId: string; errorMessage: string },
  deps: EbookWebhookLedgerDeps,
): Promise<void> {
  await deps.prisma.ebookWebhookEvent.update({
    where: { eventId: input.eventId },
    data: {
      status: 'FAILED',
      errorMessage: sanitizeEbookWebhookError(input.errorMessage),
    },
  });
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const WEBHOOK_SECRET_PATTERN = /whsec_[A-Za-z0-9]+/g;
const SECRET_KEY_PATTERN = /sk_(?:live|test)_[A-Za-z0-9]+/g;
const BEARER_PATTERN = /Bearer\s+\S+/g;

/**
 * Censura email, `whsec_...`, `sk_(live|test)_...` e `Bearer <token>`, colapsa
 * whitespace e trunca a 500 caracteres. Funcao pura, sem I/O.
 */
export function sanitizeEbookWebhookError(message: string): string {
  const masked = message
    .replace(EMAIL_PATTERN, '[email]')
    .replace(WEBHOOK_SECRET_PATTERN, 'whsec_***')
    .replace(SECRET_KEY_PATTERN, 'sk_***')
    .replace(BEARER_PATTERN, 'Bearer ***');
  return masked.replace(/\s+/g, ' ').trim().slice(0, 500);
}
