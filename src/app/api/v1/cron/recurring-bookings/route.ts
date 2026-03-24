import { NextRequest, NextResponse } from 'next/server';
import { cronService } from '@/services/cron.service';

/**
 * GET /api/v1/cron/recurring-bookings
 * Cria sessões recorrentes para a próxima semana.
 * Agendado via vercel.json: "0 23 * * 0" (domingo às 23:00 UTC).
 * Protegido por CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await cronService.runRecurringBookings();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Cron] recurring-bookings failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
