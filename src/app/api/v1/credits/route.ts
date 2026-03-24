import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/constants/enums';
import { creditService } from '@/services/credit.service';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';

/** GET /api/v1/credits — retorna saldo + breakdown de créditos do usuário */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.id;

  // Admin pode consultar qualquer usuário via ?userId=
  const { searchParams } = request.nextUrl;
  const targetUserId =
    authResult.role === UserRole.ADMIN && searchParams.get('userId') ? searchParams.get('userId')! : userId;

  try {
    // Paralelo: p95 < 200ms
    const [balance, breakdown] = await Promise.all([
      creditService.getBalance(targetUserId),
      creditService.getBreakdown(targetUserId),
    ]);

    return NextResponse.json(apiResponse({ balance, breakdown }));
  } catch (err) {
    logger.error('GET /api/v1/credits', { action: 'credits.get', userId: targetUserId }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
