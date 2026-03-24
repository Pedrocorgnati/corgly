import { NextRequest, NextResponse } from 'next/server';
import { CreateContentSchema } from '@/schemas/content.schema';
import { contentService } from '@/services/content.service';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/** GET /api/v1/content?language=EN_US */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const language = searchParams.get('language') ?? undefined;

  try {
    const content = await contentService.list(language);
    return NextResponse.json(apiResponse(content));
  } catch (err) {
    logger.error('GET /api/v1/content', { action: 'content.list' }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/content (ADMIN only) */
export async function POST(request: NextRequest) {
  // RESOLVED: Auth bypass — usar requireAdmin em vez de header check
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = CreateContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const content = await contentService.create(parsed.data, auth.id);
    return NextResponse.json(apiResponse(content, null, 'Conteúdo criado.'), { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(apiResponse(null, err.message), { status: err.status });
    }
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
