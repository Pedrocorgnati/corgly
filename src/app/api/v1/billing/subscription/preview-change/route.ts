import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-guard';
import { previewSubscriptionChange } from '@/lib/billing/subscription-preview.service';
import { AppError } from '@/lib/errors';

/** POST /api/v1/billing/subscription/preview-change - simula mudança de plano com proration. */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 });
    }

    const preview = await previewSubscriptionChange(authResult.id, body);
    return NextResponse.json(apiResponse(preview));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }

    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
