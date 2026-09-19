import { NextRequest, NextResponse } from 'next/server';
import { cronService } from '@/services/cron.service';
import { logger } from '@/lib/logger';

// GET /api/v1/cron/google-calendar-reconciliation
// Job de reconciliacao periodica para credenciais Google Calendar envelhecidas.
// Executado a cada hora via Vercel Cron.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || !cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await cronService.runGoogleCalendarReconciliation();
    return NextResponse.json({
      reconciled: result.reconciled,
      alarms: result.alarms,
    });
  } catch (error) {
    // So nome e codigo com guarda de tipo: src/lib/logger.ts serializa message e stack sem redacao.
    const nomeSeguro = /^[A-Za-z0-9_]{1,80}$/;
    const code = (error as { code?: unknown } | null | undefined)?.code;
    logger.error('Cron de reconciliacao Google Calendar falhou', {
      action: 'cron.google-calendar-reconciliation',
      errorName: error instanceof Error && nomeSeguro.test(error.name) ? error.name : 'UnknownError',
      errorCode: typeof code === 'string' && nomeSeguro.test(code) ? code : undefined,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
