import { z } from 'zod';

/**
 * Contrato de `GET /api/v1/google/calendar/status` (loop 09-06, item 020).
 *
 * A rota resolve o estado REAL da conexao do professor com a agenda Google:
 * `disconnected` (sem credencial), `connected` (refresh token valido junto ao
 * Google) ou `expired` (o Google respondeu `invalid_grant` a troca
 * `grant_type=refresh_token`).
 *
 * `connectedAt` e `scope` sao `null` no estado `disconnected`.
 * `lastSuccessfulSyncAt` e `null` ate o item 023 do loop existir: o produtor
 * do carimbo e o job de reconciliacao, ainda nao implementado. A UI trata o
 * `null` com texto explicito, entao o campo ja existe no contrato.
 *
 * Sem `expiresIn`, sem token, sem nenhum campo de segredo: o refresh token
 * NUNCA sai do servidor e o access token da verificacao e descartado em
 * memoria ao fim do request.
 *
 * Modulo ISOMORFICO de proposito (so `zod`), no molde de
 * `admin-sessions.contract.ts`: o componente importa o tipo daqui, o fetch
 * server-side valida o payload daqui e a rota valida a resposta antes de sair.
 */
export const googleCalendarStatusSchema = z.object({
  state: z.enum(['disconnected', 'connected', 'expired']),
  connectedAt: z.string().nullable(),
  lastSuccessfulSyncAt: z.string().nullable(),
  scope: z.string().nullable(),
});

export type GoogleCalendarStatusDto = z.infer<typeof googleCalendarStatusSchema>;
