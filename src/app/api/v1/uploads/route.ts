import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/auth';
import { withApiHandler } from '@/lib/api-handler';
import { UserRole } from '@/lib/constants/enums';
import { assetTypeSchema } from '@/lib/assets/asset.schema';
import {
  buildStorageKey,
  createSignedUploadUrl,
  validateUploadCandidate,
  verifySignedUrl,
} from '@/lib/assets/storage';

/**
 * POST /api/v1/uploads - emite uma URL de upload pré-assinada.
 *
 * Não recebe bytes: valida tipo/MIME/tamanho, registra o Asset em PENDING e
 * devolve a URL PUT assinada (curta expiração) por onde o cliente envia o
 * arquivo direto ao storage. Acceptance T-058: "Upload gera URL pré-assinada
 * com tipo/tamanho permitido."
 *
 * PUT /api/v1/uploads - gateway de recebimento para o provider LOCAL. Valida a
 * assinatura emitida no POST (stateless), aplicando expiração e teto de bytes.
 */

const requestUploadSchema = z.object({
  originalFilename: z.string().trim().min(1, 'Nome do arquivo obrigatório').max(255),
  mimeType: z.string().trim().min(3, 'MIME type obrigatório').max(120),
  fileSizeBytes: z.coerce.number().int().positive('fileSizeBytes deve ser positivo'),
  type: assetTypeSchema.optional(),
  sessionId: z.string().uuid('sessionId inválido').optional(),
  contentId: z.string().uuid('contentId inválido').optional(),
  checksumSha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i, 'SHA-256 inválido')
    .optional(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const userId = request.headers.get('x-user-id');
  const role = request.headers.get('x-user-role');
  if (!userId || !role) {
    return NextResponse.json(apiResponse(null, 'Não autenticado.'), { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(apiResponse(null, 'Body inválido.'), { status: 400 });
  }

  const parsed = requestUploadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      apiResponse(null, parsed.error.issues[0]?.message ?? 'Dados de upload inválidos.'),
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Validação de tipo/MIME/tamanho permitidos (anti Zero Assumido).
  const validation = validateUploadCandidate({
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    declaredType: input.type,
  });
  if (!validation.ok) {
    return NextResponse.json(apiResponse(null, validation.message), { status: validation.status });
  }

  // Quando o upload é vinculado a uma sessão, o solicitante precisa ser dono da
  // sessão (estudante) ou ADMIN - evita anexar arquivos a sessões alheias.
  if (input.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: input.sessionId },
      select: { id: true, studentId: true },
    });
    if (!session) {
      return NextResponse.json(apiResponse(null, 'Sessão não encontrada.'), { status: 404 });
    }
    if (session.studentId !== userId && role !== UserRole.ADMIN) {
      return NextResponse.json(apiResponse(null, 'Acesso negado à sessão.'), { status: 403 });
    }
  }

  // Quando o upload referencia um Content, o solicitante precisa ser o autor do
  // conteúdo ou ADMIN - evita vincular assets a conteúdo alheio (espelha a
  // checagem de sessionId acima).
  if (input.contentId) {
    const content = await prisma.content.findUnique({
      where: { id: input.contentId },
      select: { id: true, authorId: true },
    });
    if (!content) {
      return NextResponse.json(apiResponse(null, 'Conteúdo não encontrado.'), { status: 404 });
    }
    if (content.authorId !== userId && role !== UserRole.ADMIN) {
      return NextResponse.json(apiResponse(null, 'Acesso negado ao conteúdo.'), { status: 403 });
    }
  }

  const storageKey = buildStorageKey({
    type: validation.type,
    originalFilename: input.originalFilename,
    ownerId: userId,
    sessionId: input.sessionId ?? null,
  });

  const asset = await prisma.asset.create({
    data: {
      ownerId: userId,
      sessionId: input.sessionId ?? null,
      contentId: input.contentId ?? null,
      type: validation.type,
      storageProvider: 'LOCAL',
      storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      fileSizeBytes: BigInt(input.fileSizeBytes),
      checksumSha256: input.checksumSha256 ?? null,
      processingStatus: 'PENDING',
    },
    select: { id: true, storageKey: true, type: true, processingStatus: true },
  });

  const upload = createSignedUploadUrl({
    storageKey,
    scopeUserId: userId,
    maxBytes: validation.maxBytes,
    mimeType: input.mimeType,
    provider: 'LOCAL',
  });

  return NextResponse.json(
    apiResponse({
      assetId: asset.id,
      type: asset.type,
      processingStatus: asset.processingStatus,
      maxBytes: validation.maxBytes,
      upload,
    }),
    { status: 201 },
  );
});

export const PUT = withApiHandler(async (request: NextRequest) => {
  const url = new URL(request.url);
  const storageKey = url.searchParams.get('key');
  const scopeUserId = url.searchParams.get('uid');
  const exp = Number(url.searchParams.get('exp'));
  const signature = url.searchParams.get('sig');

  if (!storageKey || !scopeUserId || !signature || !Number.isFinite(exp)) {
    return NextResponse.json(apiResponse(null, 'URL de upload incompleta.'), { status: 400 });
  }

  const verdict = verifySignedUrl({
    intent: 'upload',
    storageKey,
    scopeUserId,
    expiresAtEpoch: exp,
    signature,
  });
  if (!verdict.valid) {
    const status = verdict.reason === 'expired' ? 410 : 403;
    const msg =
      verdict.reason === 'expired'
        ? 'URL de upload expirada.'
        : 'Assinatura de upload inválida.';
    return NextResponse.json(apiResponse(null, msg), { status });
  }

  // Re-impõe tipo/tamanho contra o Asset persistido no POST (fonte da verdade
  // server-side). Fecha o vetor de reuso da URL assinada para enviar conteúdo de
  // tipo/tamanho divergente do declarado - a assinatura HMAC só amarra
  // storageKey/uid/exp, então a constraint real vem do registro do Asset.
  const pending = await prisma.asset.findUnique({
    where: { storageKey },
    select: { mimeType: true, fileSizeBytes: true },
  });
  if (!pending) {
    return NextResponse.json(apiResponse(null, 'Asset de upload não encontrado.'), { status: 404 });
  }

  const declaredContentType = request.headers.get('content-type');
  if (declaredContentType) {
    const sentType = declaredContentType.split(';')[0]?.trim().toLowerCase();
    if (sentType && sentType !== pending.mimeType.toLowerCase()) {
      return NextResponse.json(
        apiResponse(null, 'Content-Type diverge do tipo declarado no upload.'),
        { status: 415 },
      );
    }
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > Number(pending.fileSizeBytes)) {
    return NextResponse.json(
      apiResponse(null, 'Arquivo excede o tamanho declarado/permitido.'),
      { status: 413 },
    );
  }

  // Em LOCAL este gateway confirma assinatura + constraints; a persistência real
  // do blob fica a cargo do provider plugado (S3/R2) ou de um worker dedicado.
  return NextResponse.json(
    apiResponse({ storageKey, accepted: true }),
    { status: 202 },
  );
});
