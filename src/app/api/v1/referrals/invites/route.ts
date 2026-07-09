import { NextRequest, NextResponse } from 'next/server';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  createReferralInviteSchema,
  referralProgramQuerySchema,
} from '@/lib/referrals/referral.schema';
import {
  ensureReferralForUser,
  isUniqueViolation,
  REFERRAL_INVITE_TTL_MS,
} from '@/lib/referrals/referral.service';

/**
 * GET /api/v1/referrals/invites?page=1&limit=20&inviteStatus=PENDING
 * Lista paginada dos convites enviados pelo aluno autenticado.
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

  const { page, limit, inviteStatus } = parsedQuery.data;

  try {
    const referral = await ensureReferralForUser(auth.id);
    const where = {
      referralId: referral.id,
      ...(inviteStatus ? { status: inviteStatus } : {}),
    };

    const [total, invites] = await prisma.$transaction([
      prisma.referralInvite.count({ where }),
      prisma.referralInvite.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          invitedEmail: true,
          invitedUserId: true,
          status: true,
          acceptedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json(
      apiResponse({
        data: invites.map((i) => ({
          id: i.id,
          invitedEmail: i.invitedEmail,
          invitedUserId: i.invitedUserId,
          status: i.status,
          acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
          expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
          createdAt: i.createdAt.toISOString(),
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }),
    );
  } catch (err) {
    logger.error('GET /api/v1/referrals/invites', { action: 'referral.invite.list', userId: auth.id }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/**
 * POST /api/v1/referrals/invites
 * Envia um convite a partir do código do aluno. Valida que o código pertence ao
 * aluno, impede autoindicação e impede convite duplicado para o mesmo e-mail.
 */
export async function POST(request: NextRequest) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const rate = await checkRateLimit(`referral:invite:create:${auth.id}`, RATE_LIMITS.GENERAL);
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

  const parsed = createReferralInviteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { referralCode, invitedEmail, expiresAt } = parsed.data;

  try {
    // O código precisa pertencer ao próprio aluno autenticado.
    const referral = await prisma.referral.findUnique({ where: { code: referralCode } });
    if (!referral || referral.referrerId !== auth.id) {
      return NextResponse.json(
        apiResponse(null, 'Código de indicação inválido ou não pertence a você.'),
        { status: 403 },
      );
    }
    if (referral.status !== 'ACTIVE') {
      return NextResponse.json(
        apiResponse(null, 'Seu programa de indicação não está ativo no momento.'),
        { status: 409 },
      );
    }

    // Anti-autoindicação: o e-mail convidado não pode ser o do próprio indicador.
    const me = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { email: true },
    });
    if (me && me.email.toLowerCase() === invitedEmail) {
      return NextResponse.json(
        apiResponse(null, 'Você não pode indicar a si mesmo.'),
        { status: 400 },
      );
    }

    // Resolve destinatário já cadastrado (para ligar invitedUserId e reforçar anti-self).
    const invitedUser = await prisma.user.findUnique({
      where: { email: invitedEmail },
      select: { id: true },
    });
    if (invitedUser && invitedUser.id === auth.id) {
      return NextResponse.json(
        apiResponse(null, 'Você não pode indicar a si mesmo.'),
        { status: 400 },
      );
    }

    const resolvedExpiresAt = expiresAt ?? new Date(Date.now() + REFERRAL_INVITE_TTL_MS);

    const invite = await prisma.referralInvite.create({
      data: {
        referralId: referral.id,
        invitedEmail,
        invitedUserId: invitedUser?.id ?? null,
        status: 'PENDING',
        expiresAt: resolvedExpiresAt,
      },
      select: { id: true, invitedEmail: true, status: true, expiresAt: true, createdAt: true },
    });

    logger.info('referral.invite.created', {
      action: 'referral.invite.create',
      referralId: referral.id,
      inviteId: invite.id,
      userId: auth.id,
    });

    return NextResponse.json(
      apiResponse(
        {
          id: invite.id,
          invitedEmail: invite.invitedEmail,
          status: invite.status,
          expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
          createdAt: invite.createdAt.toISOString(),
        },
        null,
        'Convite registrado. Quando seu indicado aceitar o convite, você poderá resgatar o crédito.',
      ),
      { status: 201 },
    );
  } catch (err) {
    // Constraint única (referralId, invitedEmail): convite duplicado.
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        apiResponse(null, 'Você já enviou um convite para este e-mail.'),
        { status: 409 },
      );
    }
    logger.error('POST /api/v1/referrals/invites', { action: 'referral.invite.create', userId: auth.id }, err);
    return NextResponse.json(
      apiResponse(null, 'Erro ao registrar o convite. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
