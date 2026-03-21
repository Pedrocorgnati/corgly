import { NextRequest, NextResponse } from 'next/server';
import { ManualCreditSchema } from '@/schemas/credit.schema';
import { creditService } from '@/services/credit.service';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/credits — student credit balance */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  const { searchParams } = request.nextUrl;

  // Admin can query any user's balance
  const targetUserId =
    role === 'ADMIN' && searchParams.get('userId')
      ? searchParams.get('userId')!
      : userId!;

  if (!targetUserId) {
    return NextResponse.json(apiResponse(null, 'Não autorizado.'), { status: 401 });
  }

  try {
    const balance = await creditService.getBalance(targetUserId);
    return NextResponse.json(apiResponse(balance));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/credits — admin: add manual credits */
export async function POST(request: NextRequest) {
  const role = request.headers.get('x-user-role');
  if (role !== 'ADMIN') {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = ManualCreditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    await creditService.addManualCredits(parsed.data);
    return NextResponse.json(apiResponse(null, null, 'Créditos adicionados com sucesso.'), { status: 201 });
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
