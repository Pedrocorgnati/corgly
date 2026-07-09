import { NextRequest, NextResponse } from 'next/server';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ensureReferralForUser } from '@/lib/referrals/referral.service';

/**
 * GET /api/v1/referrals/me
 * Programa de indicação do aluno autenticado: código próprio, convites enviados
 * e créditos concedidos. O programa é criado sob demanda no primeiro acesso.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const referral = await ensureReferralForUser(auth.id);

    const [invites, credits] = await prisma.$transaction([
      prisma.referralInvite.findMany({
        where: { referralId: referral.id },
        orderBy: { createdAt: 'desc' },
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
      prisma.referralCredit.findMany({
        where: { referralId: referral.id, beneficiaryUserId: auth.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          inviteId: true,
          amount: true,
          status: true,
          grantedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const creditsGranted = credits.filter((c) => c.status === 'GRANTED');

    return NextResponse.json(
      apiResponse({
        code: referral.code,
        status: referral.status,
        summary: {
          invitesTotal: invites.length,
          invitesAccepted: invites.filter((i) => i.status === 'ACCEPTED').length,
          invitesPending: invites.filter((i) => i.status === 'PENDING').length,
          creditsGranted: creditsGranted.length,
          creditsAmountTotal: creditsGranted.reduce((sum, c) => sum + c.amount, 0),
        },
        invites: invites.map((i) => ({
          id: i.id,
          invitedEmail: i.invitedEmail,
          invitedUserId: i.invitedUserId,
          status: i.status,
          acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
          expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
          createdAt: i.createdAt.toISOString(),
        })),
        credits: credits.map((c) => ({
          id: c.id,
          inviteId: c.inviteId,
          amount: c.amount,
          status: c.status,
          grantedAt: c.grantedAt ? c.grantedAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
        })),
      }),
    );
  } catch (err) {
    logger.error('GET /api/v1/referrals/me', { action: 'referral.me', userId: auth.id }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
