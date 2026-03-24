import { NextRequest, NextResponse } from 'next/server';
import { UpdateContentSchema } from '@/schemas/content.schema';
import { contentService } from '@/services/content.service';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { AppError } from '@/lib/errors';

/** PATCH /api/v1/content/[id] (ADMIN only) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados inválidos.'),
        { status: 400 },
      );
    }

    const content = await contentService.update(id, parsed.data, auth.id);
    return NextResponse.json(apiResponse(content));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** DELETE /api/v1/content/[id] (ADMIN only) */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await contentService.delete(id, auth.id);
    return NextResponse.json(apiResponse(null, null, 'Conteúdo removido.'));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
