import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';
import { feedbackService } from '@/services/feedback.service';
import { adminSubmitFeedbackSchema } from '@/schemas/feedback.schema';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/admin/sessions/[id]/feedback
 * Admin registers or updates feedback for a completed session (upsert).
 * Accepts privateNote (not exposed in public APIs).
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Corpo da requisição inválido.'), { status: 400 });
  }

  const parsed = adminSubmitFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados inválidos.'),
      { status: 400 },
    );
  }

  try {
    const feedback = await feedbackService.adminSubmit(auth.id, sessionId, parsed.data);
    return NextResponse.json(apiResponse(feedback), { status: 200 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        apiResponse(null, error.message, error.code),
        { status: error.status },
      );
    }
    console.error('POST /admin/sessions/[id]/feedback', error);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/**
 * GET /api/v1/admin/sessions/[id]/feedback
 * Admin retrieves full feedback for a session (including privateNote).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  try {
    const feedback = await feedbackService.getBySession(sessionId, true);
    return NextResponse.json(apiResponse(feedback));
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        apiResponse(null, error.message, error.code),
        { status: error.status },
      );
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
