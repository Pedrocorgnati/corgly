import { NextRequest, NextResponse } from 'next/server';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  grantReferralCreditSchema,
  referralProgramQuerySchema,
} from '@/lib/referrals/referral.schema';
import { isUniqueViolation, REFERRAL_CREDIT_AMOUNT } from '@/lib/referrals/referral.service';

/**
 * GET /api/v1/referrals/credits?page=1&limit=20
 * Lista paginada dos créditos de indicação do aluno autenticado (beneficiário).
 */
export async function GET(request: NextRequest) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const parsedQuery = referralProgramQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      apiResponse(null, 'Parâmetros inválidos.', parsedQuery.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { page, limit } = parsedQuery.data;
  const where = { beneficiaryUserId: auth.id };

  try {
    const [total, credits] = await prisma.$transaction([
      prisma.referralCredit.count({ where }),
      prisma.referralCredit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          inviteId: true,
          amount: true,
          status: true,
          creditBatchId: true,
          grantedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const granted = credits.filter((c) => c.status === 'GRANTED');

    return NextResponse.json(
      apiResponse({
        data: credits.map((c) => ({
          id: c.id,
          inviteId: c.inviteId,
          amount: c.amount,
          status: c.status,
          creditBatchId: c.creditBatchId,
          grantedAt: c.grantedAt ? c.grantedAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        amountGrantedTotal: granted.reduce((sum, c) => sum + c.amount, 0),
      }),
    );
  } catch (err) {
    logger.error('GET /api/v1/referrals/credits', { action: 'referral.credit.list', userId: auth.id }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/**
 * POST /api/v1/referrals/credits
 * Concede o crédito de indicação de um convite ACEITO ao indicador autenticado.
 * Idempotente por convite: a constraint `ReferralCredit.inviteId @unique` garante
 * concessão única, e uma chamada repetida retorna 200 com o crédito existente.
 */
export async function POST(request: NextRequest) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const rate = await checkRateLimit(`referral:credit:grant:${auth.id}`, RATE_LIMITS.GENERAL);
  if (!rate.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas solicitações. Tente novamente em alguns minutos.'),
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Corpo da requisição inválido.'), { status: 400 });
  }

  const parsed = grantReferralCreditSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { inviteId } = parsed.data;

  try {
    const { credit, alreadyGranted } = await prisma.$transaction(async (tx) => {
      const invite = await tx.referralInvite.findUnique({
        where: { id: inviteId },
        include: { referral: true, credit: true },
      });

      if (!invite) {
        throw new AppError('REFERRAL_404', 'Convite não encontrado.', 404);
      }
      // Apenas o indicador (dono do programa) pode reivindicar o crédito do convite.
      if (invite.referral.referrerId !== auth.id) {
        throw new AppError('REFERRAL_403', 'Este convite não pertence a você.', 403);
      }
      // Crédito já concedido para este convite (idempotente). Mantido ANTES da
      // checagem de status do programa para preservar idempotência mesmo se o
      // programa tiver sido pausado depois da concessão.
      if (invite.credit) {
        return { credit: invite.credit, alreadyGranted: true };
      }
      // O programa de indicação precisa estar ativo para conceder novo crédito.
      if (invite.referral.status !== 'ACTIVE') {
        throw new AppError(
          'REFERRAL_409',
          'Seu programa de indicação não está ativo no momento.',
          409,
        );
      }
      // Regra: o crédito só é liberado após o convite ser ACEITO.
      if (invite.status !== 'ACCEPTED') {
        throw new AppError(
          'REFERRAL_409',
          'O crédito só é liberado quando o convite é aceito pelo indicado.',
          409,
        );
      }

      // Materializa o crédito como um CreditBatch PROMO (sem expiração), reusando
      // o mesmo saldo consultado em /api/v1/credits.
      const batch = await tx.creditBatch.create({
        data: {
          userId: auth.id,
          type: 'PROMO',
          totalCredits: REFERRAL_CREDIT_AMOUNT,
          usedCredits: 0,
          expiresAt: null,
          reason: 'Crédito de indicação',
        },
      });

      const created = await tx.referralCredit.create({
        data: {
          referralId: invite.referralId,
          inviteId: invite.id,
          beneficiaryUserId: auth.id,
          creditBatchId: batch.id,
          amount: REFERRAL_CREDIT_AMOUNT,
          status: 'GRANTED',
          grantedAt: new Date(),
        },
      });

      return { credit: created, alreadyGranted: false };
    });

    if (!alreadyGranted) {
      logger.info('referral.credit.granted', {
        action: 'referral.credit.grant',
        inviteId,
        creditId: credit.id,
        userId: auth.id,
      });
    }

    return NextResponse.json(
      apiResponse(
        {
          id: credit.id,
          inviteId: credit.inviteId,
          amount: credit.amount,
          status: credit.status,
          creditBatchId: credit.creditBatchId,
          grantedAt: credit.grantedAt ? credit.grantedAt.toISOString() : null,
          alreadyGranted,
        },
        null,
        alreadyGranted
          ? 'Este convite já havia gerado crédito.'
          : 'Crédito de indicação concedido com sucesso.',
      ),
      { status: alreadyGranted ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    // Corrida: outra requisição concedeu o crédito primeiro (ReferralCredit.inviteId
    // @unique). Resolve de forma idempotente retornando o crédito já existente.
    if (isUniqueViolation(err)) {
      const existing = await prisma.referralCredit.findUnique({ where: { inviteId } });
      if (existing) {
        return NextResponse.json(
          apiResponse(
            {
              id: existing.id,
              inviteId: existing.inviteId,
              amount: existing.amount,
              status: existing.status,
              creditBatchId: existing.creditBatchId,
              grantedAt: existing.grantedAt ? existing.grantedAt.toISOString() : null,
              alreadyGranted: true,
            },
            null,
            'Este convite já havia gerado crédito.',
          ),
          { status: 200 },
        );
      }
    }
    logger.error('POST /api/v1/referrals/credits', { action: 'referral.credit.grant', userId: auth.id }, err);
    return NextResponse.json(
      apiResponse(null, 'Erro ao conceder o crédito. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
