import { NextRequest, NextResponse } from 'next/server';
import { cronService } from '@/services/cron.service';
import { logger } from '@/lib/logger';

// GET /api/v1/cron/google-calendar-channels
// Cria canais ausentes e renova os que expiram em nas proximas 24 horas.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await cronService.renewGoogleCalendarChannels();
    return NextResponse.json({ renewed: result.renewed, failed: result.errors.length });
  } catch (error) {
    logger.error('Cron de canais Google Calendar falhou', {
      action: 'cron.google-calendar-channels',
    }, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
