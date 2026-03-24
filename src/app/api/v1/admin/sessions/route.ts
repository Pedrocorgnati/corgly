import { NextRequest, NextResponse } from 'next/server';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';

/** GET /api/v1/admin/sessions?status=X&hasFeedback=false */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') ?? undefined;
  const hasFeedbackParam = searchParams.get('hasFeedback');
  const hasFeedback = hasFeedbackParam !== null ? hasFeedbackParam === 'true' : undefined;
  const page = Number(searchParams.get('page') ?? 1);
  const limit = Number(searchParams.get('limit') ?? 20);

  try {
    const result = await sessionService.listAll({ status, hasFeedback, page, limit });
    return NextResponse.json(apiResponse(result));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
