import { NextRequest, NextResponse } from 'next/server';
import { cronService } from '@/services/cron.service';

/**
 * GET /api/v1/cron/auto-confirm
 * Auto-confirma sessões encerradas sem feedback do admin.
 * Agendado via vercel.json: "*\/15 * * * *" (a cada 15 min).
 * Protegido por CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await cronService.runAutoConfirmation();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Cron] auto-confirm failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
