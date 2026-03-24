import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/constants/enums';
import { BulkCancelSchema } from '@/schemas/session.schema';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';

/** POST /api/v1/sessions/bulk-cancel (ADMIN only) */
export async function POST(request: NextRequest) {
  const role = request.headers.get('x-user-role');
  if (role !== UserRole.ADMIN) {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = BulkCancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await sessionService.bulkCancel(parsed.data);
    return NextResponse.json(apiResponse(result, null, 'Aulas canceladas em lote.'));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
