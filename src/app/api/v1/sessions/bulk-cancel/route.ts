import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/constants/enums';
import { BulkCancelSchema } from '@/schemas/session.schema';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';

/**
 * GET /api/v1/sessions/bulk-cancel?startDate=&endDate= (ADMIN only)
 *
 * Previa do bloqueio em massa: conta, sem escrever nada, quantas sessoes seriam
 * canceladas e quantos slots seriam bloqueados na janela. Antes deste handler o
 * BulkBlockModal fazia GET nesta mesma rota e recebia 405 do Next (metodo sem
 * handler exportado), engolia o erro num `catch` vazio e mostrava a semente de
 * zeros como se fosse a contagem real do periodo.
 *
 * O guard e o mesmo do POST abaixo (header `x-user-role`) de proposito: mudar o
 * modelo de auth so deste handler deixaria dois modelos no mesmo module.
 * Unificar a familia `/api/v1/sessions/*` em `requireAdmin` e trabalho de outro
 * item.
 */
export async function GET(request: NextRequest) {
  const role = request.headers.get('x-user-role');
  if (role !== UserRole.ADMIN) {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', 'startDate e endDate são obrigatórios.'),
        { status: 400 },
      );
    }

    // Mesmo schema do POST: aceita date-only e ISO completo. `reason` e opcional
    // e nao faz sentido numa previa, entao nao e lido da querystring.
    const parsed = BulkCancelSchema.safeParse({ startDate, endDate });
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    // Comparacao por INSTANTE, nao lexicografica: `DateOrDateTimeString` aceita
    // ISO-8601 completo com offset de fuso, e ai a ordem de texto julga errado
    // (`2026-05-01T00:00:00Z` e POSTERIOR a `2026-04-30T23:00:00-03:00` como
    // texto e ANTERIOR como instante). A UI so manda date-only, mas a rota e
    // superficie publica e valida o que o schema aceita.
    if (new Date(parsed.data.endDate).getTime() < new Date(parsed.data.startDate).getTime()) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', 'endDate deve ser maior ou igual a startDate.'),
        { status: 400 },
      );
    }

    const preview = await sessionService.bulkCancelPreview(parsed.data);
    return NextResponse.json(apiResponse(preview));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

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
