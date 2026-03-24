import { NextRequest, NextResponse } from 'next/server';
import { cronService } from '@/services/cron.service';

/**
 * GET /api/v1/cron/credit-expiration
 * Protegido por CRON_SECRET no header Authorization: Bearer {secret}.
 * Agendado via vercel.json: "0 3 * * *" (03:00 UTC diário).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await cronService.runCreditExpiration();
    return NextResponse.json(result);
    // { expired: N, notifiedExpiring7d: N, notifiedExpiring30d: N }
  } catch (err) {
    console.error('[Cron] credit-expiration failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
