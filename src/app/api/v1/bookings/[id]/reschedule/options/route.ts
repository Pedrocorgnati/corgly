import { NextRequest, NextResponse } from 'next/server';
import { rescheduleOptionsService } from '@/lib/bookings/reschedule-options.service';
import { apiResponse } from '@/lib/auth';
import { requireAuth } from '@/lib/auth-guard';
import { AppError } from '@/lib/errors';

/**
 * GET /api/v1/bookings/[id]/reschedule/options (ST-09)
 *
 * Retorna as alternativas padronizadas de reagendamento de uma sessão: slots
 * livres, a `policy_window` (janela livre de 12h) e a `penalty` aplicável.
 * `id` resolve para `Session.id`. Acesso restrito ao dono (ou ADMIN); a regra é
 * imposta no serviço, não inferida do client.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const result = await rescheduleOptionsService.getOptions(id, auth.id, auth.role);
    return NextResponse.json(apiResponse(result, null, 'Opções de reagendamento.'));
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
