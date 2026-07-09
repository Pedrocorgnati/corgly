import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { apiResponse, getPayloadFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { authorizeDownload, downloadDecisionToHttp } from '@/lib/privacy/data-export.service';

const idParamSchema = z.string().uuid();

/**
 * GET /api/v1/privacy/data-requests/[id]/download  (T-042 / X-19 / ST-52)
 *
 * Download do arquivo assinado de export de um DSR. É assinado, expira e exige
 * autorização (Acceptance T-042):
 *
 *   - Pedido AUTENTICADO: exige sessão válida do próprio titular (`userId`).
 *   - Pedido ANÔNIMO: exige `?token=` HMAC válido (enviado por e-mail pelo worker).
 *
 * Garante que o titular jamais acesse o pacote de outro: a autorização é feita
 * server-side ANTES de revelar a URL assinada de storage. Como `signedArchiveUrl`
 * é uma URL de storage já assinada e de curta duração, redirecionamos (302) para
 * ela após validar dono + estado + validade; o pacote em si é gerado por request
 * pelo worker DSR (T-067), nunca compartilhado entre titulares.
 *
 * Rota pública (anônimo precisa baixar sem sessão): a autenticação é detectada
 * decodificando o JWT, com revalidação de `tokenVersion` (token revogado não
 * concede acesso).
 */

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Resolve o titular autenticado a partir do JWT, validando `tokenVersion`
 * contra o banco. Retorna null para anônimo OU token inválido/revogado.
 */
async function resolveAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const payload = getPayloadFromRequest(request);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, tokenVersion: true },
  });
  if (!user) return null;
  if (user.tokenVersion !== payload.version) return null;
  return user.id;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = getClientIp(request);

  // Id malformado nunca chega ao banco: devolve o mesmo 404 de "não encontrado"
  // (não revela ids e evita 500 por erro de cast de UUID no Prisma).
  if (!idParamSchema.safeParse(id).success) {
    return NextResponse.json(apiResponse(null, 'Pedido não encontrado.'), { status: 404 });
  }

  // Rate limit por id+ip: limita tentativas de adivinhação de token anônimo.
  const limit = await checkRateLimit(`dsr:download:${id}:${ip}`, RATE_LIMITS.AUTH_FORGOT);
  if (!limit.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas tentativas de download. Tente novamente em alguns minutos.'),
      { status: 429 },
    );
  }

  const token = request.nextUrl.searchParams.get('token');

  try {
    const dataRequest = await prisma.dataRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        referenceCode: true,
        signedArchiveUrl: true,
        signedArchiveSha256: true,
        signedArchiveExpiresAt: true,
      },
    });

    // Pedido inexistente devolve o mesmo 404 de "não é dono": não revela ids.
    if (!dataRequest) {
      return NextResponse.json(apiResponse(null, 'Pedido não encontrado.'), { status: 404 });
    }

    const authUserId = await resolveAuthenticatedUserId(request);
    const decision = authorizeDownload({ dataRequest, authUserId, token });

    if (decision.reason !== 'OK' || !decision.target) {
      const { status, message } = downloadDecisionToHttp(decision.reason);
      logger.info('privacy.data_request.download_denied', {
        userId: authUserId ?? undefined,
        action: 'data_request_download_denied',
        // Rastreabilidade de tentativas de acesso indevido (anti-abuso).
        referenceCode: dataRequest.referenceCode,
        reason: decision.reason,
        ip,
      });
      return NextResponse.json(apiResponse(null, message), { status });
    }

    // Auditoria do acesso ao arquivo (UI/API canônica de auditoria é T-067).
    await prisma.auditLog.create({
      data: {
        adminId: authUserId ?? 'system',
        action: 'data_request_downloaded',
        resourceType: 'data_request',
        resourceId: dataRequest.id,
        metadata: {
          referenceCode: dataRequest.referenceCode,
          anonymous: authUserId == null,
          sha256: decision.target.sha256,
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('privacy.data_request.download', {
      userId: authUserId ?? undefined,
      action: 'data_request_downloaded',
    });

    // 302 para a URL assinada de storage (curta duração). O SHA-256 acompanha
    // como header para o cliente verificar a integridade do pacote baixado.
    const response = NextResponse.redirect(decision.target.url, { status: 302 });
    if (decision.target.sha256) {
      response.headers.set('X-Archive-SHA256', decision.target.sha256);
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    logger.error(
      'GET /api/v1/privacy/data-requests/[id]/download',
      { action: 'data_request_download' },
      err,
    );
    return NextResponse.json(
      apiResponse(null, 'Erro ao processar o download. Tente novamente em instantes.'),
      { status: 500 },
    );
  }
}
