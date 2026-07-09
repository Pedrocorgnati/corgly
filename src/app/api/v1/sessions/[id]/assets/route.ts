import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { UserRole } from '@/lib/constants/enums';

/**
 * GET /api/v1/sessions/:id/assets - lista os assets anexos a uma sessão.
 *
 * Acceptance T-058: "Sessão lista assets anexos sem vazar arquivos privados."
 *  - Só participantes autorizados (estudante dono da sessão ou ADMIN) recebem 200.
 *  - O `storageKey` cru NUNCA é exposto; cada item traz `downloadPath`, que passa
 *    pelo gateway assinado de `/assets/:id/download`.
 *  - Assets FAILED/ARCHIVED são omitidos (não há arquivo entregável).
 */

export const GET = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  if (!userId || !role) {
    return NextResponse.json(apiResponse(null, 'Não autenticado.'), { status: 401 });
  }

  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, studentId: true },
  });
  if (!session) {
    return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 });
  }

  // Anti-vazamento: apenas o estudante dono ou ADMIN enxergam os anexos.
  if (session.studentId !== userId && role !== UserRole.ADMIN) {
    return NextResponse.json(apiResponse(null, 'Acesso negado.'), { status: 403 });
  }

  const assets = await prisma.asset.findMany({
    where: {
      sessionId: id,
      processingStatus: { notIn: ['FAILED', 'ARCHIVED'] },
    },
    select: {
      id: true,
      type: true,
      originalFilename: true,
      mimeType: true,
      fileSizeBytes: true,
      durationSeconds: true,
      language: true,
      processingStatus: true,
      uploadedAt: true,
    },
    orderBy: { uploadedAt: 'desc' },
  });

  // Serializa sem storageKey/publicUrl; fileSizeBytes (BigInt) vira string.
  const items = assets.map((a) => ({
    id: a.id,
    type: a.type,
    originalFilename: a.originalFilename,
    mimeType: a.mimeType,
    fileSizeBytes: a.fileSizeBytes.toString(),
    durationSeconds: a.durationSeconds,
    language: a.language,
    processingStatus: a.processingStatus,
    uploadedAt: a.uploadedAt.toISOString(),
    downloadPath: `/api/v1/assets/${a.id}/download`,
  }));

  return NextResponse.json(
    apiResponse({ sessionId: id, count: items.length, assets: items }),
  );
});
