import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SessionStatus } from '@/lib/constants/enums';
import { PAGINATION } from '@/lib/constants';
import { creditService } from '@/services/credit.service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/admin/users/[id]
 * Returns complete student profile: info, credit summary, session history, feedback progress.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id: studentId } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id:                  true,
        name:                true,
        email:               true,
        country:             true,
        timezone:            true,
        emailConfirmed:      true,
        marketingOptIn:      true,
        preferredLanguage:   true,
        onboardingCompletedAt: true,
        createdAt:           true,
        lastLoginAt:         true,
        deletionRequestedAt: true,
      },
    });

    if (!user || user.id === undefined) {
      return NextResponse.json(apiResponse(null, 'Usuário não encontrado.'), { status: 404 });
    }

    const [creditBalance, sessionCounts, creditBatches, recentSessions, recentFeedbacks] = await Promise.all([
      // Saldo = SUM agregado no banco sobre TODOS os lotes validos do aluno.
      // Nao pode sair da lista abaixo: aquela e paginada (take), entao somar a
      // janela exibida faz o admin ver saldo MENOR que o do aluno assim que o
      // aluno tem mais lotes que o tamanho da pagina. CreditService.getBalance
      // e a fonte da verdade do predicado (nao expirado + com credito sobrando).
      creditService.getBalance(studentId),
      prisma.session.groupBy({
        by:    ['status'],
        where: { studentId },
        _count: { status: true },
      }),
      // Lista EXIBIDA de lotes — paginada de proposito (ultimos N). Serve para
      // auditoria visual, nunca para calcular saldo.
      prisma.creditBatch.findMany({
        where:   { userId: studentId },
        select:  { id: true, type: true, totalCredits: true, usedCredits: true, expiresAt: true },
        orderBy: { createdAt: 'desc' },
        take:    PAGINATION.USER_DETAIL_PAYMENTS,
      }),
      prisma.session.findMany({
        where:   { studentId },
        // A relacao feedback precisa ser carregada de verdade para `hasFeedback`
        // nao ler propriedade inexistente no payload da sessao.
        select:  { id: true, status: true, startAt: true, completedAt: true, feedback: { select: { id: true } } },
        orderBy: { startAt: 'desc' },
        take:    PAGINATION.USER_DETAIL_SESSIONS,
      }),
      prisma.feedback.findMany({
        where:   { session: { studentId } },
        // Dimensoes reais do model Feedback (schema.prisma): listening, speaking,
        // writing e vocabulary. overallFeedback e o texto publico ao aluno;
        // privateNote (nota interna do admin) segue fora de proposito.
        select:  {
          id:                 true,
          listeningScore:     true,
          speakingScore:      true,
          writingScore:       true,
          vocabularyScore:    true,
          overallFeedback:    true,
          reviewed:           true,
          reviewedAt:         true,
          createdAt:          true,
          session:            { select: { startAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take:    PAGINATION.USER_DETAIL_TOP_SESSIONS,
      }),
    ]);

    // Marca cada lote exibido como expirado ou nao, para o admin entender por
    // que um lote com "restantes" > 0 pode nao estar somando no saldo (o
    // soft-expire so zera o lote no cron diario).
    const now = new Date();
    const creditBatchesView = creditBatches.map((b) => ({
      id:        b.id,
      type:      b.type,
      total:     b.totalCredits,
      used:      b.usedCredits,
      remaining: b.totalCredits - b.usedCredits,
      expiresAt: b.expiresAt,
      expired:   !!b.expiresAt && b.expiresAt <= now,
    }));

    // Session counts by status
    const sessionStats: Record<string, number> = {};
    for (const g of sessionCounts) {
      sessionStats[g.status] = g._count.status;
    }

    return NextResponse.json(apiResponse({
      user,
      stats: {
        creditBalance,
        totalSessions:     Object.values(sessionStats).reduce((a, b) => a + b, 0),
        completedSessions: sessionStats[SessionStatus.COMPLETED] ?? 0,
        cancelledSessions: (sessionStats[SessionStatus.CANCELLED_BY_STUDENT] ?? 0) + (sessionStats[SessionStatus.CANCELLED_BY_ADMIN] ?? 0),
      },
      creditBatches: creditBatchesView,
      recentSessions: recentSessions.map((s) => ({
        id:          s.id,
        status:      s.status,
        startAt:     s.startAt,
        completedAt: s.completedAt,
        hasFeedback: !!s.feedback,
      })),
      recentFeedbacks: recentFeedbacks.map((f) => ({
        id:           f.id,
        sessionDate:  f.session.startAt,
        scores: {
          listening:  f.listeningScore,
          speaking:   f.speakingScore,
          writing:    f.writingScore,
          vocabulary: f.vocabularyScore,
        },
        averageScore: Math.round(
          ((f.listeningScore + f.speakingScore + f.writingScore + f.vocabularyScore) / 4) * 10,
        ) / 10,
        overallFeedback: f.overallFeedback,
        reviewed:     f.reviewed,
        reviewedAt:   f.reviewedAt,
        createdAt:    f.createdAt,
      })),
    }));
  } catch (err) {
    console.error('GET /admin/users/[id]', err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
