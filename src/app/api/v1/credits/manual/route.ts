import { NextRequest, NextResponse } from 'next/server';
import { ManualCreditSchema } from '@/schemas/credit.schema';
import { creditService } from '@/services/credit.service';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { AppError } from '@/lib/errors';

/** POST /api/v1/credits/manual — admin: adicionar créditos manuais com razão auditável */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof Response || 'error' in authResult) {
    return authResult as NextResponse;
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 });
    }

    const parsed = ManualCreditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await creditService.addManualCredits(parsed.data);
    return NextResponse.json(
      apiResponse({ userId: parsed.data.userId, newBalance: result.newBalance }, null, 'Créditos adicionados com sucesso.'),
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
