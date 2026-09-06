import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/v1/admin/sessions/[id] — detalhe de sessão para admin */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true, name: true, email: true, timezone: true },
        },
        creditBatch: {
          select: { id: true, type: true, totalCredits: true },
        },
        // Dimensoes reais do model Feedback (schema.prisma): listening, speaking,
        // writing e vocabulary. `comment` nao existe — o texto publico e
        // overallFeedback; privateNote fica fora do payload por ser nota interna.
        feedback: {
          select: {
            id: true,
            listeningScore: true,
            speakingScore: true,
            writingScore: true,
            vocabularyScore: true,
            overallFeedback: true,
            reviewed: true,
            reviewedAt: true,
          },
        },
      },
    });

    if (!session) {
      throw new AppError('SESSION_030', 'Sessão não encontrada.', 404);
    }

    return NextResponse.json(apiResponse(session));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    logger.error(
      'GET /api/v1/admin/sessions/[id]',
      { action: 'admin.sessions.get', route: '/api/v1/admin/sessions/[id]' },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
