import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { feedbackService } from '@/services/feedback.service';

/**
 * GET /api/v1/feedback?page=1&limit=10&sessionId=X
 * Lists feedbacks for the authenticated student (paginated).
 * Admin route: /api/v1/admin/feedback (see admin/feedback).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const page      = Math.max(1, Number(searchParams.get('page')  ?? 1));
  const limit     = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? 10)));
  const sessionId = searchParams.get('sessionId') ?? undefined;

  try {
    const result = await feedbackService.listForStudent(auth.id, page, limit, sessionId);
    return NextResponse.json(apiResponse(result));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
