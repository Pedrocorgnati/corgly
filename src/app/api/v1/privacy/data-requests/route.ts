import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { apiResponse, getPayloadFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createDataRequestSchema } from '@/lib/privacy/data-request.schema';
import {
  computeSlaDueAt,
  computeEmailVerificationExpiresAt,
  shouldAutoVerifyEmail,
  getDataRequestPolicy,
} from '@/lib/privacy/data-request.policy';

/**
 * POST /api/v1/privacy/data-requests  (T-041 / X-19 / ST-52)
 *
 * Cria um Data Subject Request (DSR) anônimo OU autenticado sobre o modelo
 * unificado ratificado em T-048/T-049 (ADR-0004): um único `DataRequest`, com
 * `userId` nullable como discriminador. Toda solicitação:
 *
 *   1. Passa por verificação de e-mail (`PENDING_EMAIL_VERIFICATION`), exceto
 *      quando autenticada com e-mail batendo o da conta já confirmada
 *      (`shouldAutoVerifyEmail` -> entra direto em `PENDING`).
 *   2. Enfileira um `DataRequestJob` assíncrono (status `QUEUED`,
 *      `scheduledAt = now`), de modo que o pickup de processamento fica muito
 *      abaixo do alvo operacional de 72h citado no escopo original da task.
 *      O SLA legal de atendimento (`DataRequest.slaDueAt`) é separado e segue a
 *      política canônica (LGPD Art. 19) via `computeSlaDueAt`.
 *   3. Grava `AuditLog` direto via Prisma (UI/API canônica de auditoria é T-067).
 *
 * Rota pública (anônimo precisa postar sem sessão): a autenticação é detectada
 * decodificando o JWT direto do cookie/Authorization, porque middleware de
 * paths públicos não propaga `x-user-id`.
 */

/** Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para o código de referência. */
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateReferenceCode(): string {
  const bytes = randomBytes(10);
  let body = '';
  for (const byte of bytes) {
    body += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  // Formato `DSR-XXXXXXXXXX`: casa o regex `^DSR-[A-Z0-9-]+$` e cabe em 40 chars.
  return `DSR-${body}`;
}

/**
 * Gera um `referenceCode` único checando colisão antes da inserção. O espaço
 * (31^10) torna colisão improvável, mas o retry evita um 500 por unique
 * constraint, garantindo que o titular sempre receba um código.
 */
async function generateUniqueReferenceCode(
  tx: { dataRequest: { findUnique: (args: { where: { referenceCode: string } }) => Promise<unknown> } },
  maxAttempts = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateReferenceCode();
    const existing = await tx.dataRequest.findUnique({ where: { referenceCode: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Não foi possível gerar um código de referência único.');
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Chave de rate limit por fingerprint composto (IP + user-agent truncado).
 * Sem o user-agent, todos os clientes sem IP identificável (`unknown`)
 * compartilhariam o mesmo bucket e poderiam se bloquear mutuamente.
 */
function buildRateLimitKey(request: NextRequest): string {
  const ip = getClientIp(request);
  const uaHash = createHash('sha256')
    .update(request.headers.get('user-agent') ?? 'no-ua')
    .digest('hex')
    .slice(0, 12);
  return `dsr:create:${ip}:${uaHash}`;
}

/**
 * Resolve o titular autenticado a partir do JWT, validando `tokenVersion`
 * contra o banco. Retorna null para anônimo OU token inválido/revogado
 * (token stale nunca concede auto-verify de e-mail).
 */
async function resolveAuthenticatedUser(request: NextRequest) {
  const payload = getPayloadFromRequest(request);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, emailConfirmed: true, tokenVersion: true },
  });

  if (!user) return null;
  if (user.tokenVersion !== payload.version) return null;

  return user;
}

export async function POST(request: NextRequest) {
  // ─── Rate limit por fingerprint composto (evita abuso do endpoint público) ─
  const ip = getClientIp(request);
  const limit = await checkRateLimit(buildRateLimitKey(request), RATE_LIMITS.AUTH_FORGOT);
  if (!limit.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas solicitações. Tente novamente em alguns minutos.'),
      { status: 429 },
    );
  }

  // ─── Parse + validação ────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Corpo da requisição inválido.'), { status: 400 });
  }

  const parsed = createDataRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const input = parsed.data;

  // O canal `ADMIN` é reservado a pedidos abertos por um operador via a rota
  // administrativa (T-067). Aceitá-lo aqui deixaria um cliente público marcar a
  // própria solicitação como originada por admin, corrompendo a proveniência de
  // auditoria. Self-service só pode declarar canais self-service.
  if (input.channel === 'ADMIN') {
    return NextResponse.json(
      apiResponse(null, 'Canal inválido para pedido self-service.'),
      { status: 400 },
    );
  }

  try {
    const authUser = await resolveAuthenticatedUser(request);
    const now = new Date();

    const autoVerify = shouldAutoVerifyEmail({
      userId: authUser?.id ?? null,
      requesterEmail: input.requesterEmail,
      accountEmail: authUser?.email,
      accountEmailVerified: authUser?.emailConfirmed,
    });

    const policy = getDataRequestPolicy(input.type);
    const slaDueAt = computeSlaDueAt(input.type, now);

    // Token de verificação de e-mail: o hash fica em metadata; o envio do
    // e-mail (com o token em claro) é responsabilidade do worker DSR (T-067).
    const verificationToken = autoVerify ? null : randomBytes(32).toString('hex');
    const verificationTokenHash = verificationToken
      ? createHash('sha256').update(verificationToken).digest('hex')
      : null;
    const verificationExpiresAt = autoVerify ? null : computeEmailVerificationExpiresAt(now);

    const metadata: Record<string, unknown> = {
      requesterIp: ip,
      anonymous: authUser == null,
      // Registro durável do consentimento (schema exige privacyAccepted=true). Sem
      // persistir, não haveria prova de que o titular aceitou a política (LGPD).
      privacyAccepted: input.privacyAccepted,
      privacyAcceptedAt: now.toISOString(),
      producesSignedArchive: policy.producesSignedArchive,
      hasGracePeriod: policy.hasGracePeriod,
      // Alvo operacional de pickup do job (escopo original T-041). O job é
      // enfileirado imediatamente, então o tempo de pickup << 72h.
      jobPickupSlaHours: 72,
    };
    if (input.message) metadata.message = input.message;
    if (verificationTokenHash) {
      metadata.emailVerification = {
        tokenHash: verificationTokenHash,
        expiresAt: verificationExpiresAt?.toISOString(),
      };
    }

    const created = await prisma.$transaction(async (tx) => {
      const referenceCode = await generateUniqueReferenceCode(tx);
      const dataRequest = await tx.dataRequest.create({
        data: {
          referenceCode,
          userId: authUser?.id ?? null,
          type: input.type,
          channel: input.channel,
          requesterEmail: input.requesterEmail,
          requesterEmailVerifiedAt: autoVerify ? now : null,
          status: autoVerify ? 'PENDING' : 'PENDING_EMAIL_VERIFICATION',
          slaDueAt,
          correctionPayload: (input.correctionPayload ?? undefined) as never,
          metadata: metadata as never,
        },
        select: { id: true, referenceCode: true, type: true, status: true, slaDueAt: true },
      });

      // Job assincrono enfileirado de imediato (QUEUED, scheduledAt default now).
      await tx.dataRequestJob.create({
        data: { dataRequestId: dataRequest.id, status: 'QUEUED' },
      });

      // Auditoria direta via Prisma. Sem admin no fluxo self-service: usa o
      // próprio titular quando autenticado, ou o sentinel `system` no anônimo.
      await tx.auditLog.create({
        data: {
          adminId: authUser?.id ?? 'system',
          action: 'data_request_created',
          resourceType: 'data_request',
          resourceId: dataRequest.id,
          metadata: {
            type: dataRequest.type,
            channel: input.channel,
            status: dataRequest.status,
            anonymous: authUser == null,
            referenceCode: dataRequest.referenceCode,
          } as never,
        },
      });

      return dataRequest;
    });

    logger.info('privacy.data_request.created', {
      action: 'data_request_created',
      type: created.type,
      anonymous: authUser == null,
      emailVerificationRequired: !autoVerify,
    });

    return NextResponse.json(
      apiResponse(
        {
          referenceCode: created.referenceCode,
          type: created.type,
          status: created.status,
          slaDueAt: created.slaDueAt.toISOString(),
          emailVerificationRequired: !autoVerify,
        },
        null,
        autoVerify
          ? 'Pedido registrado. Acompanhe o andamento pelo código de referência.'
          : 'Pedido registrado. Confirme pelo link enviado ao seu e-mail para prosseguir.',
      ),
      { status: 201 },
    );
  } catch (err) {
    logger.error('POST /api/v1/privacy/data-requests', { action: 'data_request_create' }, err);
    return NextResponse.json(
      apiResponse(null, 'Erro ao registrar o pedido. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
