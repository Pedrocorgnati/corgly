/**
 * Rota POST /api/v1/google/calendar/webhook
 * Recebe notificacoes push do Google Calendar.
 *
 * Headers enviados pelo Google:
 * - X-Goog-Channel-ID: ID do canal
 * - X-Goog-Channel-Token: token secreto definido na criacao do canal
 * - X-Goog-Resource-ID: ID do recurso
 * - X-Goog-Resource-State: exists | not_exists | sync
 * - X-Goog-Message-Number: numero sequencial
 *
 * Estados do recurso:
 * - sync: handshake inicial (canal criado)
 * - exists: evento modificado/criado
 * - not_exists: recurso removido (canal parado)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

/**
 * Calcula SHA-256 de uma string em hex.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Comparacao em tempo constante para evitar timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export async function POST(request: NextRequest) {
  // Extrair headers do Google
  const channelId = request.headers.get('X-Goog-Channel-ID');
  const channelToken = request.headers.get('X-Goog-Channel-Token');
  const resourceId = request.headers.get('X-Goog-Resource-ID');
  const resourceState = request.headers.get('X-Goog-Resource-State');
  const messageNumberRaw = request.headers.get('X-Goog-Message-Number');

  // Validar headers obrigatorios
  if (!channelId || !channelToken || !resourceId || !resourceState || !messageNumberRaw) {
    return NextResponse.json(
      { error: 'Missing required headers' },
      { status: 400 },
    );
  }

  // Validar formato decimal de messageNumber
  if (!/^\d+$/.test(messageNumberRaw)) {
    return NextResponse.json(
      { error: 'Invalid message number format' },
      { status: 400 },
    );
  }

  if (!['sync', 'exists', 'not_exists'].includes(resourceState)) {
    return NextResponse.json(
      { error: 'Unsupported resource state' },
      { status: 400 },
    );
  }

  // Encontrar credencial pelo channelId
  const credential = await prisma.googleCalendarCredential.findUnique({
    where: { channelId },
    select: {
      id: true,
      userId: true,
      channelTokenHash: true,
      resourceId: true,
      lastMessageNumber: true,
    },
  });

  if (!credential) {
    return NextResponse.json(
      { error: 'Channel not found' },
      { status: 404 },
    );
  }

  // Autenticar token (comparacao em tempo constante)
  if (!credential.channelTokenHash) {
    return NextResponse.json(
      { error: 'Channel token not configured' },
      { status: 401 },
    );
  }

  const tokenHash = hashToken(channelToken);
  if (!timingSafeEqual(tokenHash, credential.channelTokenHash)) {
    return NextResponse.json(
      { error: 'Invalid channel token' },
      { status: 401 },
    );
  }

  // Verificar resourceId se ja vinculado
  if (credential.resourceId && credential.resourceId !== resourceId) {
    return NextResponse.json(
      { error: 'Resource ID mismatch' },
      { status: 401 },
    );
  }

  // O unico estado autorizado a vincular o resourceId de um canal pending e
  // o handshake sync. Exists/not_exists antes desse bind sao forjados.
  if (!credential.resourceId && resourceState !== 'sync') {
    return NextResponse.json(
      { error: 'Resource ID not bound' },
      { status: 401 },
    );
  }

  // O resourceId ainda desconhecido so pode ser vinculado pelo handshake sync.
  // exists/not_exists antes desse bind nao possuem autenticacao completa.
  if (!credential.resourceId && resourceState !== 'sync') {
    return NextResponse.json(
      { error: 'Resource ID not bound' },
      { status: 401 },
    );
  }

  // Tratar estados do recurso
  if (resourceState === 'sync') {
    // Handshake inicial: vincular resourceId pendente
    if (!credential.resourceId) {
      await prisma.googleCalendarCredential.updateMany({
        where: {
          channelId,
          resourceId: null,
        },
        data: {
          resourceId,
        },
      });
    }
    // Nao dispara sincronizacao (createChannel ja faz full sync)
    return new NextResponse(null, { status: 204 });
  }

  if (resourceState === 'not_exists') {
    // Canal removido: limpar estado se ainda for o canal corrente
    await googleCalendarPushService.handleChannelNotExists(credential.userId, channelId);
    return new NextResponse(null, { status: 204 });
  }

  if (resourceState === 'exists') {
    // Evento modificado: disparar sincronizacao incremental
    try {
      await googleCalendarPushService.incrementalSync(credential.userId, {
        channelId,
        messageNumber: BigInt(messageNumberRaw),
      });
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      // Verificar se e erro de lease ocupado
      if (err instanceof AppError && err.code === 'GOOGLE_SYNC_BUSY') {
        // Retornar 503 com Retry-After para que o Google reenvie
        const response = new NextResponse(null, { status: 503 });
        response.headers.set('Retry-After', '60');
        return response;
      }
      // Outros erros retornam 500
      logger.error('Erro na sincronizacao incremental', { action: 'google-calendar.webhook.sync', userId: credential.userId, errorName: err instanceof Error ? err.name : 'UnknownError', errorCode: typeof (err as { code?: unknown } | null)?.code === 'string' ? (err as { code: string }).code : undefined });
      return NextResponse.json(
        { error: 'Sync failed' },
        { status: 500 },
      );
    }
  }

  // Estado desconhecido
  return NextResponse.json(
    { error: 'Unsupported resource state' },
    { status: 400 },
  );
}
