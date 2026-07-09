import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { UserRole } from '@/lib/constants/enums';
import { createSignedDownloadUrl, verifySignedUrl } from '@/lib/assets/storage';

/**
 * GET /api/v1/assets/:id/download
 *
 * Dois modos (Acceptance T-058: "Download assinado expira e valida owner/role"):
 *
 *  1. Emissão (sem `mode=fetch`): autentica via headers, carrega o asset, valida
 *     owner/role e devolve uma URL de download assinada de curta expiração.
 *  2. Fetch (`mode=fetch` + assinatura): stateless, verifica assinatura/expiração
 *     e resolve o destino do arquivo (publicUrl/storageKey). Não revalida sessão.
 *
 * O storageKey privado nunca aparece no modo de emissão - só o link assinado.
 */

type AssetAccess = {
  id: string;
  ownerId: string | null;
  sessionId: string | null;
  storageKey: string;
  storageProvider: 'LOCAL' | 'S3' | 'R2' | 'VERCEL_BLOB' | 'EXTERNAL';
  publicUrl: string | null;
  mimeType: string;
  originalFilename: string;
  processingStatus: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'ARCHIVED';
  session: { studentId: string } | null;
};

/** Owner direto, ADMIN ou estudante dono da sessão à qual o asset pertence. */
function canAccessAsset(asset: AssetAccess, userId: string, role: string): boolean {
  if (role === UserRole.ADMIN) return true;
  if (asset.ownerId && asset.ownerId === userId) return true;
  if (asset.session && asset.session.studentId === userId) return true;
  return false;
}

export const GET = withApiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');

  // --- Modo 2: fetch stateless via assinatura ---
  if (mode === 'fetch') {
    const storageKey = url.searchParams.get('key');
    const scopeUserId = url.searchParams.get('uid');
    const exp = Number(url.searchParams.get('exp'));
    const signature = url.searchParams.get('sig');

    if (!storageKey || !scopeUserId || !signature || !Number.isFinite(exp)) {
      return NextResponse.json(apiResponse(null, 'URL de download incompleta.'), { status: 400 });
    }

    const verdict = verifySignedUrl({
      intent: 'download',
      storageKey,
      scopeUserId,
      expiresAtEpoch: exp,
      signature,
    });
    if (!verdict.valid) {
      const status = verdict.reason === 'expired' ? 410 : 403;
      const msg =
        verdict.reason === 'expired'
          ? 'Link de download expirado.'
          : 'Assinatura de download inválida.';
      return NextResponse.json(apiResponse(null, msg), { status });
    }

    const asset = (await prisma.asset.findUnique({
      where: { id },
      select: {
        id: true,
        storageKey: true,
        storageProvider: true,
        publicUrl: true,
        mimeType: true,
        originalFilename: true,
        processingStatus: true,
      },
    })) as (Omit<AssetAccess, 'ownerId' | 'sessionId' | 'session'>) | null;

    if (!asset || asset.storageKey !== storageKey) {
      return NextResponse.json(apiResponse(null, 'Asset não encontrado.'), { status: 404 });
    }

    // Provider com URL pública resolvível: redireciona ao destino real.
    if (asset.publicUrl) {
      return NextResponse.redirect(asset.publicUrl, { status: 302 });
    }

    return NextResponse.json(
      apiResponse({
        assetId: asset.id,
        storageProvider: asset.storageProvider,
        mimeType: asset.mimeType,
        originalFilename: asset.originalFilename,
      }),
    );
  }

  // --- Modo 1: emissão autenticada da URL assinada ---
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  if (!userId || !role) {
    return NextResponse.json(apiResponse(null, 'Não autenticado.'), { status: 401 });
  }

  const asset = (await prisma.asset.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      sessionId: true,
      storageKey: true,
      storageProvider: true,
      publicUrl: true,
      mimeType: true,
      originalFilename: true,
      processingStatus: true,
      session: { select: { studentId: true } },
    },
  })) as AssetAccess | null;

  if (!asset) {
    return NextResponse.json(apiResponse(null, 'Asset não encontrado.'), { status: 404 });
  }

  if (!canAccessAsset(asset, userId, role)) {
    return NextResponse.json(apiResponse(null, 'Acesso negado.'), { status: 403 });
  }

  if (asset.processingStatus === 'FAILED' || asset.processingStatus === 'ARCHIVED') {
    return NextResponse.json(
      apiResponse(null, `Asset não disponível para download (status: ${asset.processingStatus}).`),
      { status: 409 },
    );
  }

  const download = createSignedDownloadUrl({
    assetId: asset.id,
    storageKey: asset.storageKey,
    scopeUserId: userId,
    provider: asset.storageProvider,
  });

  return NextResponse.json(
    apiResponse({
      assetId: asset.id,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      processingStatus: asset.processingStatus,
      download,
    }),
  );
});
