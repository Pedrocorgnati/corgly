import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/v1/auth/export-data
 * LGPD Art.20 — Exportação de dados pessoais do usuário autenticado.
 * Retorna JSON para download imediato, excluindo campos sensíveis de segurança.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const userId = auth.id;

  try {
    const [user, sessions, feedbacks, credits, payments, consent] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          country: true,
          timezone: true,
          preferredLanguage: true,
          marketingOptIn: true,
          onboardingCompletedAt: true,
          termsAcceptedAt: true,
          termsVersion: true,
          createdAt: true,
          // EXCLUÍDOS: passwordHash, emailConfirmToken, resetPasswordToken,
          // stripeCustomerId, tokenVersion, deletionCancellationToken
        },
      }),
      prisma.session.findMany({
        where: { studentId: userId },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          isRecurring: true,
          cancelledAt: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      prisma.feedback.findMany({
        where: { session: { studentId: userId } },
        select: {
          id: true,
          sessionId: true,
          clarityScore: true,
          didacticsScore: true,
          punctualityScore: true,
          engagementScore: true,
          comment: true,
          createdAt: true,
          // EXCLUÍDOS: privateNote (nota interna do admin)
        },
      }),
      prisma.creditBatch.findMany({
        where: { userId },
        select: {
          id: true,
          type: true,
          totalCredits: true,
          usedCredits: true,
          expiresAt: true,
          createdAt: true,
          // EXCLUÍDO: stripePaymentIntentId
        },
      }),
      prisma.payment.findMany({
        where: { userId },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          // EXCLUÍDO: stripePaymentIntentId, stripeEventId
        },
      }),
      prisma.cookieConsent.findFirst({
        where: { userId },
        select: {
          essentialAccepted: true,
          analyticsAccepted: true,
          marketingAccepted: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user,
      sessions,
      feedbacks,
      credits,
      payments,
      cookieConsent: consent,
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="corgly-data-export-${userId}.json"`,
      },
    });
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
