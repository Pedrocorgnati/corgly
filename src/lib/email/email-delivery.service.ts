import 'server-only';
import { randomUUID } from 'node:crypto';
// Enums tipados pelo cliente Prisma (verdade do schema do banco): um log de
// entrega so pode carregar um EmailType valido na coluna ENUM. Por isso o
// servico usa os enums do @prisma/client, nao o superset de @/types/enums.
import { Prisma, EmailType, SupportedLanguage } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { signUnsubscribeToken } from '@/lib/email/unsubscribe-token';

/**
 * Servico de logs de envio + comunicacao em massa (T-055 / AD-33).
 *
 * Dois contratos:
 *  1. `sendAndLog`  — envia UM email pelo provider e SEMPRE registra o resultado
 *     em `EmailDelivery` (provider id, status, codigo/mensagem de erro). Nenhum
 *     envio fica sem rastro (Zero Silencio).
 *  2. `sendBroadcast` — dispara um broadcast de marketing para um segmento
 *     permitido. Respeita o opt-out (unsubscribe) existente: usuarios com
 *     `marketingOptIn = false` NUNCA recebem o email e ficam registrados como
 *     `SKIPPED` com motivo `marketing_opt_out`, tornando o respeito ao
 *     unsubscribe auditavel no proprio log.
 *
 * O envio de fato reusa a Resend HTTP API (mesmo provider de `email.service.ts`),
 * mas aqui capturamos o `providerMessageId` retornado, que o caminho
 * transacional descarta. O provider e injetavel para testes.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;
const DEFAULT_FROM = process.env.EMAIL_FROM ?? 'Corgly <no-reply@corgly.app>';

/** Teto de seguranca por broadcast (evita fan-out ilimitado). */
export const BROADCAST_MAX_RECIPIENTS = 5_000;

/** Resultado de um envio unitario pelo provider. */
export interface ProviderSendResult {
  /** id da mensagem retornado pelo provider (null quando indisponivel). */
  providerMessageId: string | null;
  /** nome do provider efetivamente usado (null no modo noop sem chave). */
  provider: string | null;
}

/** Contrato do provider de envio (injetavel). */
export type EmailProviderSend = (params: {
  to: string;
  subject: string;
  html: string;
  from: string;
}) => Promise<ProviderSendResult>;

/**
 * Provider Resend baseado em fetch. Captura o `id` da resposta como
 * `providerMessageId`. Lanca em status != 2xx (o chamador registra FAILED).
 * Sem `RESEND_API_KEY`, opera em modo noop (nao envia, providerMessageId null).
 */
export function createResendProvider(apiKey = process.env.RESEND_API_KEY): EmailProviderSend {
  if (!apiKey) {
    return async (params) => {
      if (typeof console !== 'undefined') {
        console.info('[email-delivery] NOOP — RESEND_API_KEY ausente.', {
          to: params.to,
          subject: params.subject,
        });
      }
      return { providerMessageId: null, provider: null };
    };
  }

  return async (params) => {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Resend error ${response.status}: ${body?.message ?? 'unknown'}`);
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { providerMessageId: body?.id ?? null, provider: 'resend' };
  };
}

const defaultProvider = createResendProvider();

/** Erro do provider normalizado em codigo + mensagem para o log. */
function describeError(err: unknown): { errorCode: string; errorMessage: string } {
  if (err instanceof Error) {
    const match = err.message.match(/^Resend error (\d+)/);
    return {
      errorCode: match ? `resend_${match[1]}` : 'provider_error',
      errorMessage: err.message.slice(0, 2_000),
    };
  }
  return { errorCode: 'unknown_error', errorMessage: String(err).slice(0, 2_000) };
}

/** Footer de unsubscribe multilingue (espelha email.service para broadcasts). */
function renderUnsubscribeFooter(userId: string, locale: SupportedLanguage): string {
  const token = signUnsubscribeToken(userId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://corgly.app';
  const url = `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
  const labels: Record<SupportedLanguage, { line: string; link: string }> = {
    PT_BR: { line: 'Você está recebendo este email porque autorizou comunicações de marketing.', link: 'Descadastrar' },
    EN_US: { line: 'You are receiving this email because you opted in to marketing communications.', link: 'Unsubscribe' },
    ES_ES: { line: 'Recibes este correo porque aceptaste recibir comunicaciones de marketing.', link: 'Darse de baja' },
    IT_IT: { line: 'Ricevi questa email perché hai accettato le comunicazioni di marketing.', link: 'Annulla iscrizione' },
  };
  const l = labels[locale];
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
    ${l.line}
    <br/>
    <a href="${url}" style="color:#2563eb;text-decoration:underline;">${l.link}</a>
  </div>`;
}

export interface SendAndLogParams {
  type: EmailType;
  locale: SupportedLanguage;
  to: string;
  userId?: string | null;
  subject: string;
  html: string;
  templateId?: string | null;
  data?: Prisma.InputJsonValue;
}

export interface DeliveryLogResult {
  deliveryId: string;
  status: 'SENT' | 'FAILED';
  providerMessageId: string | null;
  errorCode: string | null;
}

/**
 * Envia UM email e registra o resultado em EmailDelivery. Nunca lanca por falha
 * de envio: a falha vira um registro FAILED com codigo/mensagem (Zero Silencio).
 */
export async function sendAndLog(
  params: SendAndLogParams,
  provider: EmailProviderSend = defaultProvider,
): Promise<DeliveryLogResult> {
  let providerMessageId: string | null = null;
  let providerName: string | null = null;
  let status: 'SENT' | 'FAILED' = 'SENT';
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  try {
    const result = await provider({
      to: params.to,
      subject: params.subject,
      html: params.html,
      from: DEFAULT_FROM,
    });
    providerMessageId = result.providerMessageId;
    providerName = result.provider;
  } catch (err) {
    status = 'FAILED';
    const described = describeError(err);
    errorCode = described.errorCode;
    errorMessage = described.errorMessage;
  }

  const now = new Date();
  const delivery = await prisma.emailDelivery.create({
    data: {
      templateId: params.templateId ?? null,
      type: params.type,
      locale: params.locale,
      toEmail: params.to,
      userId: params.userId ?? null,
      provider: providerName,
      providerMessageId,
      status,
      subject: params.subject,
      renderedHtml: params.html,
      data: params.data ?? Prisma.JsonNull,
      errorCode,
      errorMessage,
      attempts: 1,
      sentAt: status === 'SENT' ? now : null,
      failedAt: status === 'FAILED' ? now : null,
    },
    select: { id: true },
  });

  return { deliveryId: delivery.id, status, providerMessageId, errorCode };
}

/** Registra um envio pulado (sem chamar o provider). */
async function recordSkipped(params: {
  type: EmailType;
  locale: SupportedLanguage;
  to: string;
  userId: string;
  subject: string;
  reason: string;
  data?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.emailDelivery.create({
    data: {
      type: params.type,
      locale: params.locale,
      toEmail: params.to,
      userId: params.userId,
      status: 'SKIPPED',
      subject: params.subject,
      errorCode: params.reason,
      data: params.data ?? Prisma.JsonNull,
      attempts: 0,
    },
    select: { id: true },
  });
}

// ── Broadcasts ────────────────────────────────────────────────────────────

/** Segmentos permitidos para broadcast (allowlist — Zero Assumido). */
export const BROADCAST_SEGMENTS = [
  'ALL',
  'STUDENTS',
  'ADMINS',
  'LOCALE_PT_BR',
  'LOCALE_EN_US',
  'LOCALE_ES_ES',
  'LOCALE_IT_IT',
] as const;

export type BroadcastSegment = (typeof BROADCAST_SEGMENTS)[number];

export const BROADCAST_SEGMENT_LABELS: Record<BroadcastSegment, string> = {
  ALL: 'Todos os usuarios (opt-in)',
  STUDENTS: 'Alunos',
  ADMINS: 'Administradores',
  LOCALE_PT_BR: 'Idioma: Portugues (BR)',
  LOCALE_EN_US: 'Idioma: Ingles (US)',
  LOCALE_ES_ES: 'Idioma: Espanhol (ES)',
  LOCALE_IT_IT: 'Idioma: Italiano (IT)',
};

export function isBroadcastSegment(value: unknown): value is BroadcastSegment {
  return typeof value === 'string' && (BROADCAST_SEGMENTS as readonly string[]).includes(value);
}

/**
 * Filtro base do segmento. Apenas usuarios com email confirmado entram no
 * candidato. O respeito ao opt-out e tratado no loop de envio (registrando
 * SKIPPED), portanto o `where` do segmento NAO filtra `marketingOptIn` aqui.
 */
function segmentWhere(segment: BroadcastSegment): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { emailConfirmed: true };
  switch (segment) {
    case 'ALL':
      return base;
    case 'STUDENTS':
      return { ...base, role: 'STUDENT' };
    case 'ADMINS':
      return { ...base, role: 'ADMIN' };
    case 'LOCALE_PT_BR':
      return { ...base, preferredLanguage: SupportedLanguage.PT_BR };
    case 'LOCALE_EN_US':
      return { ...base, preferredLanguage: SupportedLanguage.EN_US };
    case 'LOCALE_ES_ES':
      return { ...base, preferredLanguage: SupportedLanguage.ES_ES };
    case 'LOCALE_IT_IT':
      return { ...base, preferredLanguage: SupportedLanguage.IT_IT };
  }
}

export interface BroadcastInput {
  segment: BroadcastSegment;
  subject: string;
  html: string;
  adminId: string;
  /** id externo opcional (gerado quando ausente). */
  broadcastId?: string;
  provider?: EmailProviderSend;
}

export interface BroadcastResult {
  broadcastId: string;
  segment: BroadcastSegment;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  capped: boolean;
}

/**
 * Dispara um broadcast de marketing para o segmento. Cada destinatario gera
 * exatamente um registro EmailDelivery (SENT | FAILED | SKIPPED). Opt-out e
 * respeitado: usuarios sem marketingOptIn viram SKIPPED sem envio.
 */
export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const broadcastId = input.broadcastId ?? randomUUID();
  const provider = input.provider ?? defaultProvider;
  const where = segmentWhere(input.segment);

  const recipients = await prisma.user.findMany({
    where,
    select: { id: true, email: true, preferredLanguage: true, marketingOptIn: true },
    take: BROADCAST_MAX_RECIPIENTS + 1,
    orderBy: { createdAt: 'asc' },
  });

  const capped = recipients.length > BROADCAST_MAX_RECIPIENTS;
  const batch = capped ? recipients.slice(0, BROADCAST_MAX_RECIPIENTS) : recipients;

  const meta: Prisma.InputJsonValue = { broadcastId, segment: input.segment };
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of batch) {
    const locale = recipient.preferredLanguage as SupportedLanguage;

    if (!recipient.marketingOptIn) {
      await recordSkipped({
        type: EmailType.MARKETING_BROADCAST,
        locale,
        to: recipient.email,
        userId: recipient.id,
        subject: input.subject,
        reason: 'marketing_opt_out',
        data: meta,
      });
      skipped += 1;
      continue;
    }

    const html = `${input.html}${renderUnsubscribeFooter(recipient.id, locale)}`;
    const result = await sendAndLog(
      {
        type: EmailType.MARKETING_BROADCAST,
        locale,
        to: recipient.email,
        userId: recipient.id,
        subject: input.subject,
        html,
        data: meta,
      },
      provider,
    );

    if (result.status === 'SENT') sent += 1;
    else failed += 1;
  }

  return {
    broadcastId,
    segment: input.segment,
    total: batch.length,
    sent,
    failed,
    skipped,
    capped,
  };
}

/** Linha de log de entrega (projecao para a UI admin). */
export interface DeliveryLogRow {
  id: string;
  toEmail: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  locale: string;
  createdAt: Date;
}

/** Entregas de um broadcast especifico (detalhe do log). */
export async function listBroadcastDeliveries(
  broadcastId: string,
  limit = 500,
): Promise<DeliveryLogRow[]> {
  const rows = await prisma.emailDelivery.findMany({
    where: {
      type: EmailType.MARKETING_BROADCAST,
      data: { path: '$.broadcastId', equals: broadcastId },
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(2_000, Math.max(1, limit)),
    select: {
      id: true,
      toEmail: true,
      status: true,
      provider: true,
      providerMessageId: true,
      errorCode: true,
      errorMessage: true,
      locale: true,
      createdAt: true,
    },
  });
  return rows;
}
