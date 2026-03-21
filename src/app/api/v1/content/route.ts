import { NextRequest, NextResponse } from 'next/server';
import { CreateContentSchema } from '@/schemas/content.schema';
import { contentService } from '@/services/content.service';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/content?language=EN_US */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const language = searchParams.get('language') ?? undefined;

  try {
    const content = await contentService.list(language);
    return NextResponse.json(apiResponse(content));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/content (ADMIN only) */
export async function POST(request: NextRequest) {
  const role = request.headers.get('x-user-role');
  if (role !== 'ADMIN') {
    return NextResponse.json(apiResponse(null, 'Acesso restrito a administradores.'), { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = CreateContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const content = await contentService.create(parsed.data);
    return NextResponse.json(apiResponse(content, null, 'Conteúdo criado.'), { status: 201 });
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
