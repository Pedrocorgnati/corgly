import { NextRequest, NextResponse } from 'next/server';
import { notesUpsertSchema } from '@/schemas/notes.schema';
import { getPayloadFromRequest, apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';

/** GET /api/v1/content/[id]/notes — fetch user notes for a content item */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getPayloadFromRequest(request);
  if (!payload) {
    return NextResponse.json(apiResponse(null, 'Não autenticado.'), { status: 401 });
  }

  const { id } = await params;

  // MVP: return empty notes — replace with DB query when ready
  return NextResponse.json(
    apiResponse({
      contentId: id,
      userId: payload.sub,
      content: '',
      updatedAt: new Date().toISOString(),
    }),
  );
}

/** PUT /api/v1/content/[id]/notes — upsert user notes for a content item */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getPayloadFromRequest(request);
  if (!payload) {
    return NextResponse.json(apiResponse(null, 'Não autenticado.'), { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = notesUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    // MVP: acknowledge save without persisting — replace with DB upsert when ready
    return NextResponse.json(
      apiResponse({
        contentId: id,
        userId: payload.sub,
        content: parsed.data.content,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch (err) {
    logger.error('PUT /api/v1/content/[id]/notes', { action: 'notes.upsert' }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}
