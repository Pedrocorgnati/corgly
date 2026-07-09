import { NextRequest, NextResponse } from 'next/server';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { acceptReferralRequestSchema } from '@/lib/referrals/referral.schema';

/**
 * POST /api/v1/referrals/accept
 * Aceite de convite pelo convidado autenticado. Liga o convite PENDING ao usuário
 * que aceita (invitedUserId derivado da sessão, nunca do corpo), transiciona o
 * status para ACCEPTED e carimba acceptedAt - destravando o path de concessão de
 * crédito (POST /api/v1/referrals/credits exige status ACCEPTED).
 *
 * Sem este endpoint o crédito de indicação seria inatingível (Zero Orfaos): o
 * convite nasce PENDING e nada o transicionava para ACCEPTED.
 */
export async function POST(request: NextRequest) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const rate = await checkRateLimit(`referral:invite:accept:${auth.id}`, RATE_LIMITS.GENERAL);
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

  const parsed = acceptReferralRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
      { status: 400 },
    );
  }

  const { referralCode } = parsed.data;

  try {
    // E-mail do convidado autenticado (vínculo natural com o convite por invitedEmail).
    const me = await prisma.user.findUnique({
      where: { id: auth.id },
      select: { email: true },
    });
    if (!me) {
      throw new AppError('REFERRAL_404', 'Usuário não encontrado.', 404);
    }
    const myEmail = me.email.toLowerCase();

    const invite = await prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({ where: { code: referralCode } });
      if (!referral) {
        throw new AppError('REFERRAL_404', 'Código de indicação inválido.', 404);
      }
      // Anti-autoindicação: o dono do programa não pode aceitar o próprio convite.
      if (referral.referrerId === auth.id) {
        throw new AppError('REFERRAL_400', 'Você não pode aceitar o seu próprio convite.', 400);
      }

      // Localiza o convite endereçado ao e-mail do convidado autenticado.
      const found = await tx.referralInvite.findUnique({
        where: { referralId_invitedEmail: { referralId: referral.id, invitedEmail: myEmail } },
      });
      if (!found) {
        throw new AppError('REFERRAL_404', 'Nenhum convite para o seu e-mail neste programa.', 404);
      }

      // Convite já aceito por este usuário: resposta idempotente.
      if (found.status === 'ACCEPTED') {
        if (found.invitedUserId && found.invitedUserId !== auth.id) {
          throw new AppError('REFERRAL_409', 'Este convite já foi aceito por outra conta.', 409);
        }
        return found;
      }

      if (found.status === 'REVOKED') {
        throw new AppError('REFERRAL_409', 'Este convite foi revogado.', 409);
      }

      // Expiração on-read: convite vencido transiciona para EXPIRED e é rejeitado.
      if (found.expiresAt && found.expiresAt.getTime() <= Date.now()) {
        await tx.referralInvite.update({
          where: { id: found.id },
          data: { status: 'EXPIRED' },
        });
        throw new AppError('REFERRAL_410', 'Este convite expirou.', 410);
      }

      return tx.referralInvite.update({
        where: { id: found.id },
        data: { status: 'ACCEPTED', invitedUserId: auth.id, acceptedAt: new Date() },
      });
    });

    logger.info('referral.invite.accepted', {
      action: 'referral.invite.accept',
      referralId: invite.referralId,
      inviteId: invite.id,
      userId: auth.id,
    });

    return NextResponse.json(
      apiResponse(
        {
          id: invite.id,
          status: invite.status,
          acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
        },
        null,
        'Convite aceito com sucesso.',
      ),
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    logger.error('POST /api/v1/referrals/accept', { action: 'referral.invite.accept', userId: auth.id }, err);
    return NextResponse.json(
      apiResponse(null, 'Erro ao aceitar o convite. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
