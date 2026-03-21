import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/admin/students/[id] */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = request.headers.get('x-user-role');
  if (role !== 'ADMIN') {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const { id } = await params;
    // TODO: Implementar via /auto-flow execute
    return NextResponse.json(apiResponse(null));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** PATCH /api/v1/admin/students/[id] — update maxFutureSessions etc */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = request.headers.get('x-user-role');
  if (role !== 'ADMIN') {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const { id } = await params;
    // TODO: Implementar via /auto-flow execute
    return NextResponse.json(apiResponse(null, 'Not implemented - run /auto-flow execute'), { status: 501 });
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
