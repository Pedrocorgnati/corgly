import { NextRequest, NextResponse } from 'next/server';
import { requireStudent } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { feedbackService } from '@/services/feedback.service';
import { submitFeedbackSchema } from '@/schemas/feedback.schema';
import { sendFeedbackAvailableEmail } from '@/lib/email/feedback-available';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/sessions/[id]/feedback
 * Student submits session-quality feedback (clarity, didactics, punctuality, engagement).
 * Validates: session exists → owner → COMPLETED → window 48h → not duplicate → schema → creates.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireStudent(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Corpo da requisição inválido.'), { status: 400 });
  }

  const parsed = submitFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados inválidos.'),
      { status: 400 },
    );
  }

  try {
    const feedback = await feedbackService.submit(auth.id, sessionId, parsed.data);

    // Fire-and-forget email notification
    // Fetch student info for email (non-blocking)
    void (async () => {
      try {
        const { prisma } = await import('@/lib/prisma');
        const session = await prisma.session.findUnique({
          where:  { id: sessionId },
          select: { student: { select: { email: true, name: true } }, startAt: true },
        });
        if (session) {
          void sendFeedbackAvailableEmail({
            studentEmail: session.student.email,
            studentName:  session.student.name,
            sessionDate:  session.startAt,
            feedbackUrl:  `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/session/${sessionId}/feedback`,
          });
        }
      } catch {
        // ignore — fire-and-forget
      }
    })();

    return NextResponse.json(apiResponse(feedback), { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        apiResponse(null, error.message, error.code),
        { status: error.status },
      );
    }
    console.error('POST /sessions/[id]/feedback', error);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
