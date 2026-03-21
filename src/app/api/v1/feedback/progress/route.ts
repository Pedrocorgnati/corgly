import { NextRequest, NextResponse } from 'next/server';
import { feedbackService } from '@/services/feedback.service';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/feedback/progress?studentId=X */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')!;
  const role = request.headers.get('x-user-role')!;
  const { searchParams } = request.nextUrl;

  const targetStudentId =
    role === 'ADMIN' && searchParams.get('studentId')
      ? searchParams.get('studentId')!
      : userId;

  try {
    const progress = await feedbackService.getProgress(targetStudentId);
    return NextResponse.json(apiResponse(progress));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
