import { NextRequest, NextResponse } from 'next/server';
import { cronService } from '@/services/cron.service';

/**
 * GET /api/v1/cron/reminders
 * Envia reminders de 24h e 1h antes das sessões.
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
    const result = await cronService.runReminders();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Cron] reminders failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
