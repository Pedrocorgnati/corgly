import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/constants/enums';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { feedbackService } from '@/services/feedback.service';

/**
 * GET /api/v1/feedback/progress?studentId=X
 * Returns progress data: average scores, trend, last 3 feedbacks.
 * Admin can query any student via ?studentId=. Students always see their own.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;

  const targetStudentId =
    auth.role === UserRole.ADMIN && searchParams.get('studentId')
      ? searchParams.get('studentId')!
      : auth.id;

  try {
    const progress = await feedbackService.getProgress(targetStudentId);
    return NextResponse.json(apiResponse(progress));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
