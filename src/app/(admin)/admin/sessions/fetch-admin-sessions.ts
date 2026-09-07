import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { internalApiOrigin } from '@/lib/internal-api';
import { logger } from '@/lib/logger';
import { API } from '@/lib/constants/routes';

import { adminSessionsPageSchema, type AdminSessionsPageDto } from './admin-sessions.contract';

/** Envelope de TODA rota `/api/v1/*` (`apiResponse` em src/lib/auth.ts). */
const envelopeSchema = z.object({
  data: z.unknown(),
  error: z.string().nullable().optional(),
});

export type ResultadoListagemAdmin =
  | { kind: 'ok'; sessions: AdminSessionsPageDto }
  | { kind: 'error'; message: string };

export interface ParametrosListagemAdmin {
  page: number;
  limit: number;
  status?: string | undefined;
  /** `undefined` = sem filtro; `true` = ja avaliadas; `false` = pendentes. */
  hasFeedback?: boolean | undefined;
}

/**
 * Busca a listagem do console admin em `GET /api/v1/admin/sessions`.
 *
 * Por que NAO `getSessions` (src/actions/sessions.ts): aquele fetcher chama
 * `GET /api/v1/sessions`, a listagem GENERICA. Ela nao devolve `studentName`
 * nem `score` (as colunas "Aluno" e "Score" caiam no traco em toda linha) e nao
 * entende o filtro `hasFeedback`, que so existe na rota admin. A tela do admin
 * pedia a rota errada e depois reclamava da resposta.
 *
 * Credencial: o cookie de sessao, encaminhado para a propria API interna — o
 * MESMO padrao do detalhe (`[id]/page.tsx`) e de `src/actions/admin-students.ts`.
 * Os headers de confianca (`x-user-id`, `x-user-role`) nao servem: `src/proxy.ts`
 * os remove de tudo que entra e so os injeta no ramo `/api/v1` depois de validar
 * o token, entao uma pagina do App Router nunca os recebe e a rota responderia 401.
 */
export async function fetchAdminSessions(
  params: ParametrosListagemAdmin,
): Promise<ResultadoListagemAdmin> {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page));
  qs.set('limit', String(params.limit));
  if (params.status) qs.set('status', params.status);
  if (params.hasFeedback !== undefined) qs.set('hasFeedback', String(params.hasFeedback));

  const path = `${API.ADMIN.SESSIONS}?${qs.toString()}`;
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
    logger.error('Falha de rede ao listar sessões do admin', { action: 'admin.sessions.list', path }, err);
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
      action: 'admin.sessions.list',
      path,
      status: res.status,
    });
    return { kind: 'error', message: `Falha ao carregar sessões (HTTP ${res.status}).` };
  }

  const envelope = envelopeSchema.safeParse(corpo);

  if (!res.ok) {
    const mensagem = envelope.success ? envelope.data.error : null;
    return { kind: 'error', message: mensagem ?? `Falha ao carregar sessões (HTTP ${res.status}).` };
  }

  if (!envelope.success) {
    logger.error('Envelope da API interna fora do formato', {
      action: 'admin.sessions.list',
      path,
      issues: envelope.error.issues,
    });
    return { kind: 'error', message: 'Resposta do servidor fora do formato esperado.' };
  }

  const parsed = adminSessionsPageSchema.safeParse(envelope.data.data);
  if (!parsed.success) {
    logger.error('Contrato de dados quebrado na listagem de sessões do admin', {
      action: 'admin.sessions.list',
      path,
      issues: parsed.error.issues,
    });
    return { kind: 'error', message: 'Resposta do servidor fora do formato esperado.' };
  }

  return { kind: 'ok', sessions: parsed.data };
}
