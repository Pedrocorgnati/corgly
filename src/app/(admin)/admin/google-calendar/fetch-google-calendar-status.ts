import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { internalApiOrigin } from '@/lib/internal-api';
import { logger } from '@/lib/logger';
import { API } from '@/lib/constants/routes';

import {
  googleCalendarStatusSchema,
  type GoogleCalendarStatusDto,
} from './google-calendar-status.contract';

/** Envelope de TODA rota `/api/v1/*` (`apiResponse` em src/lib/auth.ts). */
const envelopeSchema = z.object({
  data: z.unknown(),
  error: z.string().nullable().optional(),
});

export type ResultadoStatusGoogle =
  | { kind: 'ok'; status: GoogleCalendarStatusDto }
  | { kind: 'error'; message: string };

/**
 * Busca o estado da conexao Google do professor em
 * `GET /api/v1/google/calendar/status`.
 *
 * No molde de `fetchAdminSessions`: paginas do App Router nao recebem os
 * headers de confianca (`x-user-id`, `x-user-role`) — o proxy os remove de
 * tudo que entra e so os injeta no ramo `/api/v1` depois de validar o token —
 * entao a pagina chama a propria API interna encaminhando o cookie de sessao
 * e valida envelope e payload com Zod antes de renderizar. A pagina NUNCA
 * renderiza payload nao validado.
 */
export async function fetchGoogleCalendarStatus(): Promise<ResultadoStatusGoogle> {
  const path = API.GOOGLE_CALENDAR_STATUS;
  const cookieStore = await cookies();
  const baseUrl = await internalApiOrigin();

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieStore.toString(),
      },
      cache: 'no-store',
    });
  } catch (err) {
    logger.error('Falha de rede ao consultar o estado da conexão Google', { action: 'admin.google-calendar.status', path }, err);
    return { kind: 'error', message: 'Não foi possível falar com o servidor.' };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      kind: 'error',
      message: 'Sessão de administrador expirada ou sem permissão. Entre novamente.',
    };
  }

  let corpo: unknown;
  try {
    corpo = await res.json();
  } catch {
    logger.error('Resposta ilegível da API interna', {
      action: 'admin.google-calendar.status',
      path,
      status: res.status,
    });
    return { kind: 'error', message: `Falha ao carregar o estado da conexão (HTTP ${res.status}).` };
  }

  const envelope = envelopeSchema.safeParse(corpo);

  if (!res.ok) {
    const mensagem = envelope.success ? envelope.data.error : null;
    return { kind: 'error', message: mensagem ?? `Falha ao carregar o estado da conexão (HTTP ${res.status}).` };
  }

  if (!envelope.success) {
    logger.error('Envelope da API interna fora do formato', {
      action: 'admin.google-calendar.status',
      path,
      issues: envelope.error.issues,
    });
    return { kind: 'error', message: 'Resposta do servidor fora do formato esperado.' };
  }

  const parsed = googleCalendarStatusSchema.safeParse(envelope.data.data);
  if (!parsed.success) {
    logger.error('Contrato de dados quebrado no status da conexão Google', {
      action: 'admin.google-calendar.status',
      path,
      issues: parsed.error.issues,
    });
    return { kind: 'error', message: 'Resposta do servidor fora do formato esperado.' };
  }

  return { kind: 'ok', status: parsed.data };
}
