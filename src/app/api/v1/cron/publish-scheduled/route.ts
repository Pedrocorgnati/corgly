import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/v1/cron/publish-scheduled
 * Promove Content status=SCHEDULED -> PUBLISHED quando publishedAt <= now.
 * Agendar via vercel.json: "*\/5 * * * *". Protegido por CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const result = await prisma.content.updateMany({
      where: { status: 'SCHEDULED', publishedAt: { lte: now } },
      data:  { status: 'PUBLISHED' },
    });
    return NextResponse.json({ ok: true, published: result.count, at: now.toISOString() });
  } catch (err) {
    console.error('[Cron] publish-scheduled failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
