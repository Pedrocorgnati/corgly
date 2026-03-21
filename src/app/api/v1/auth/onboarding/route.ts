import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';

/** POST /api/v1/auth/onboarding — mark onboarding as complete */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json(apiResponse(null, 'Não autorizado.'), { status: 401 });
  }

  try {
    await authService.completeOnboarding(userId);
    return NextResponse.json(apiResponse(null, null, 'Onboarding concluído.'));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
