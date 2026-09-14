/**
 * Rota POST /api/v1/google/calendar/sync
 * Trigger manual de sincronizacao da agenda do professor.
 *
 * So o professor (admin) pode disparar a sincronizacao.
 * Usa `requireAdmin` para autenticacao.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { googleCalendarPushService } from '@/services/google-calendar-push.service';
import { AppError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  // Autentica e pega o ID do usuario (professor)
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    // Executa a sincronizacao
    const resultado = await googleCalendarPushService.incrementalSync(auth.id);

    return NextResponse.json({
      success: true,
      resumo: {
        eventosProcessados: resultado.eventosProcessados,
        slotsBloqueados: resultado.bloqueados.length,
        slotsLiberados: resultado.liberados.length,
        conflitos: resultado.conflitos.length,
        detalhes: resultado,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status }
      );
    }
    throw error;
  }
}
