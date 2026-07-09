import { NextRequest, NextResponse } from 'next/server';
import { CancelDeletionSchema } from '@/schemas/auth.schema';
import { authService } from '@/services/auth.service';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** POST /api/v1/auth/cancel-deletion */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CancelDeletionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiResponse(null, 'Token inválido.'), { status: 400, headers: NO_STORE });
    }

    await authService.cancelDeletion(parsed.data.token);
    return NextResponse.json(
      apiResponse(null, null, 'Exclusão cancelada com sucesso.'),
      { headers: NO_STORE },
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_TOKEN') {
      return NextResponse.json(
        apiResponse(null, 'Link inválido ou expirado. Se precisar de ajuda, entre em contato com o suporte.'),
        { status: 400, headers: NO_STORE },
      );
    }
    logger.error('POST /api/v1/auth/cancel-deletion', { action: 'deletion.cancel' }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500, headers: NO_STORE });
  }
}
