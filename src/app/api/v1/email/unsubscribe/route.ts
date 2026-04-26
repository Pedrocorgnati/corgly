import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/email/unsubscribe?token=...
 * Publica (sem auth): o proprio token assinado prova posse.
 * Redireciona para /unsubscribe?status=... apos flipar marketingOptIn=false.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const redirectBase = new URL('/unsubscribe', request.nextUrl.origin);

  if (!token) {
    redirectBase.searchParams.set('status', 'invalid');
    return NextResponse.redirect(redirectBase);
  }

  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    redirectBase.searchParams.set('status', 'invalid');
    return NextResponse.redirect(redirectBase);
  }

  try {
    await prisma.user.update({
      where: { id: payload.sub },
      data: { marketingOptIn: false },
    });
    redirectBase.searchParams.set('status', 'success');
    return NextResponse.redirect(redirectBase);
  } catch (err) {
    logger.error('unsubscribe failed', { userId: payload.sub, action: 'unsubscribe' }, err);
    redirectBase.searchParams.set('status', 'error');
    return NextResponse.redirect(redirectBase);
  }
}
