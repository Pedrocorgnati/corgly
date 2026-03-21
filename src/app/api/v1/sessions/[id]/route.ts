import { NextRequest, NextResponse } from 'next/server';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/sessions/[id] */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = request.headers.get('x-user-id')!;
  const role = request.headers.get('x-user-role')!;

  try {
    const { id } = await params;
    const session = await sessionService.getById(id, userId, role);
    if (!session) {
      return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 });
    }
    return NextResponse.json(apiResponse(session));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
