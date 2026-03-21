import { NextRequest, NextResponse } from 'next/server';
import { UpdateContentSchema } from '@/schemas/content.schema';
import { contentService } from '@/services/content.service';
import { apiResponse } from '@/lib/auth';

/** PATCH /api/v1/content/[id] (ADMIN only) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = request.headers.get('x-user-role');
  if (role !== 'ADMIN') {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const content = await contentService.update(id, parsed.data);
    return NextResponse.json(apiResponse(content));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** DELETE /api/v1/content/[id] (ADMIN only) */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = request.headers.get('x-user-role');
  if (role !== 'ADMIN') {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const { id } = await params;
    await contentService.delete(id);
    return NextResponse.json(apiResponse(null, null, 'Conteúdo removido.'));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
