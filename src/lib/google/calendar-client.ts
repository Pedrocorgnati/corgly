/**
 * @module lib/google/calendar-client
 * Cliente Google Calendar que usa refresh token cifrado para obter access token
 * e consultar eventos da agenda do professor (item 021 do loop).
 *
 * Estendido no item 022 para suportar:
 *  - Sincronizacao incremental com syncToken
 *  - Push notifications via events.watch
 *  - Retry centralizado com backoff exponencial
 *
 * USA FETCH NATIVO, sem dependencia `googleapis`, para manter o projeto leve
 * e alinhado com a abordagem do item 019. O escopo OAuth concedido e
 * `calendar.readonly`: leitura de eventos, nunca escrita.
 *
 * Tratamento de erros:
 *  - Credencial inexistente -> AppError `GOOGLE_CREDENTIAL_NOT_FOUND`
 *  - Refresh token invalido -> AppError `GOOGLE_REFRESH_TOKEN_INVALID`
 *  - Erro de API -> AppError `GOOGLE_API_ERROR`
 *  - syncToken invalido -> AppError `GOOGLE_SYNC_TOKEN_EXPIRED` (410)
 */

import 'server-only';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { decryptCredential } from './credential-crypto';

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const CALENDAR_WATCH_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch';
const CHANNELS_STOP_URL = 'https://www.googleapis.com/calendar/v3/channels/stop';

/** Configuracao de retry. */
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

/** Evento retornado pela Google Calendar API. */
export interface GoogleCalendarEvent {
  id: string;
  status: 'confirmed' | 'cancelled' | 'tentative';
  /** `opaque` = ocupa agenda; `transparent` = nao bloqueia. */
  transparency?: 'opaque' | 'transparent';
  start: {
    dateTime?: string; // ISO 8601 para eventos com horario
    date?: string; // YYYY-MM-DD para eventos de dia inteiro
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  /** `showDeleted=true` popula este campo para instancias canceladas. */
  recurringEventId?: string;
}

/** Resultado paginado da consulta de eventos. */
export interface GoogleCalendarEventsResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

/** Resultado de sincronizacao (full ou incremental). */
export interface CalendarSyncResult {
  events: GoogleCalendarEvent[];
  nextSyncToken: string;
}

/** Canal push criado via events.watch. */
export interface WatchChannel {
  channelId: string;
  resourceId: string;
  expiration: Date;
}

/**
 * Calcula delay com backoff exponencial e jitter.
 */
function calculateDelay(attempt: number): number {
  const baseDelay = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = Math.random() * 0.1 * baseDelay;
  return baseDelay + jitter;
}

/**
 * Verifica se o status HTTP e retryable.
 * Retry: 429 (rate limit), 5xx (server errors).
 * Nao retry: 400, 401, 403, 410 (permanent errors).
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function retryAfterDelayMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/**
 * Wrapper de fetch com retry para chamadas Google.
 * Repete apenas erros de transporte, 429 e 5xx.
 * Nunca repete 400, 401, 403 ou 410.
 *
 * @param url URL do endpoint
 * @param options Opcoes do fetch
 * @param retryCount Contador interno de tentativas
 * @returns Response
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryCount = 0,
): Promise<Response> {
  const response = await fetch(url, options).catch((err) => {
    // Erro de rede -> retry
    if (retryCount < MAX_RETRIES - 1) {
      const delay = calculateDelay(retryCount);
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(fetchWithRetry(url, options, retryCount + 1));
        }, delay);
      });
    }
    throw new AppError('GOOGLE_API_ERROR', `Falha de conexao com Google: ${err}`, 502);
  });

  // Resposta recebida
  if (!response.ok) {
    // Classificar o status ANTES de considerar Retry-After. Um servidor pode
    // enviar esse header em 4xx permanente; isso nao autoriza retry generico.
    if (isRetryableStatus(response.status) && retryCount < MAX_RETRIES - 1) {
      const delay = retryAfterDelayMs(response.headers.get('Retry-After'))
        ?? calculateDelay(retryCount);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retryCount + 1);
    }
  }

  return response;
}

/**
 * Obtem um access token usando o refresh token armazenado no banco.
 * Retorna o token e sua duracao em segundos.
 */
async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // 400 Bad Request com "invalid_grant" indica refresh token revogado ou expirado
    if (response.status === 400 && errorText.includes('invalid_grant')) {
      throw new AppError('GOOGLE_REFRESH_TOKEN_INVALID', 'Refresh token do Google invalido ou revogado.', 401);
    }
    throw new AppError('GOOGLE_API_ERROR', `Falha ao obter access token do Google: ${response.status} ${errorText}`, 502);
  }

  const data = await response.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * Consulta eventos da agenda primaria no intervalo especificado.
 * Percorre todas as paginas antes de retornar, para evitar que uma lista
 * parcial cause revogacao indevida de eventos validos.
 *
 * @param accessToken Token de acesso OAuth
 * @param timeMin Inicio da janela (ISO 8601)
 * @param timeMax Fim da janela (ISO 8601)
 * @returns Lista completa de eventos (incluindo cancelados com showDeleted)
 */
async function fetchAllEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const allEvents: GoogleCalendarEvent[] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true', // Expande recorrencias em instancias individuais
      orderBy: 'startTime',
      showDeleted: 'true', // Inclui eventos cancelados para detectar remocoes
      maxResults: '250', // Maximo permitido pela API
    });
    if (nextPageToken) {
      params.set('pageToken', nextPageToken);
    }

    const response = await fetchWithRetry(`${CALENDAR_EVENTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError('GOOGLE_API_ERROR', `Falha ao consultar Google Calendar: ${response.status} ${errorText}`, 502);
    }

    const data: GoogleCalendarEventsResponse = await response.json();
    if (data.items) {
      allEvents.push(...data.items);
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return allEvents;
}

/**
 * Sincronizacao paginada (full ou incremental).
 * - Full sync: usar timeMin/timeMax
 * - Incremental sync: usar syncToken
 *
 * @param accessToken Token de acesso OAuth
 * @param options Opcoes de sincronizacao
 * @returns Eventos e nextSyncToken
 */
async function fetchEventChanges(
  accessToken: string,
  options: { syncToken?: string; timeMin?: Date; timeMax?: Date },
): Promise<CalendarSyncResult> {
  const allEvents: GoogleCalendarEvent[] = [];
  let nextPageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '250',
    });

    // Full sync: timeMin/timeMax
    if (options.timeMin && options.timeMax) {
      params.set('timeMin', options.timeMin.toISOString());
      params.set('timeMax', options.timeMax.toISOString());
    }

    // Incremental sync: syncToken (NAO enviar timeMin, timeMax ou orderBy)
    if (options.syncToken) {
      params.set('syncToken', options.syncToken);
    }

    if (nextPageToken) {
      params.set('pageToken', nextPageToken);
    }

    const response = await fetchWithRetry(`${CALENDAR_EVENTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      if (response.status === 410 && options.syncToken) {
        throw new AppError(
          'GOOGLE_SYNC_TOKEN_EXPIRED',
          'syncToken invalido ou expirado; full sync obrigatorio.',
          410,
        );
      }
      const errorText = await response.text();
      throw new AppError('GOOGLE_API_ERROR', `Falha ao sincronizar: ${response.status} ${errorText}`, 502);
    }

    const data: GoogleCalendarEventsResponse = await response.json();
    if (data.items) {
      allEvents.push(...data.items);
    }
    nextPageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken;
  } while (nextPageToken);

  // nextSyncToken so existe na ultima pagina
  if (!nextSyncToken) {
    throw new AppError('GOOGLE_SYNC_TOKEN_MISSING', 'Resposta do Google sem nextSyncToken.', 502);
  }

  return { events: allEvents, nextSyncToken };
}

/**
 * Cria um canal push para receber notificacoes de mudancas.
 *
 * @param accessToken Token de acesso OAuth
 * @param webhookUrl URL publica para receber notificacoes
 * @param channelId ID unico do canal (gerado pelo chamador)
 * @param channelToken Token secreto (gerado pelo chamador)
 * @returns Informacoes do canal criado
 */
async function watchEvents(
  accessToken: string,
  webhookUrl: string,
  channelId: string,
  channelToken: string,
): Promise<WatchChannel> {
  const requestBody = JSON.stringify({
    id: channelId,
    type: 'web_hook',
    address: webhookUrl,
    token: channelToken,
    params: {
      ttl: '604800', // 7 dias em segundos
    },
  });

  const response = await fetchWithRetry(CALENDAR_WATCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError('GOOGLE_API_ERROR', `Falha ao criar canal push: ${response.status} ${errorText}`, 502);
  }

  const data = await response.json();

  // Verifica se o ID retornado bate com o enviado
  if (data.id !== channelId) {
    throw new AppError(
      'GOOGLE_CHANNEL_ID_MISMATCH',
      'Google retornou identificador de canal divergente.',
      502,
    );
  }

  return {
    channelId,
    resourceId: data.resourceId,
    expiration: new Date(parseInt(data.expiration, 10)),
  };
}

/**
 * Para um canal push existente.
 * 404 e 410 sao idempotentes (canal ja nao existe).
 *
 * @param accessToken Token de acesso OAuth
 * @param channelId ID do canal
 * @param resourceId ID do recurso
 */
async function stopEventsWatch(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  const response = await fetchWithRetry(CHANNELS_STOP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });

  // 404 e 410 sao idempotentes
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const errorText = await response.text();
    throw new AppError('GOOGLE_API_ERROR', `Falha ao parar canal: ${response.status} ${errorText}`, 502);
  }
}

/**
 * Converte uma string ISO 8601 ou YYYY-MM-DD para Date.
 * Eventos de dia inteiro retornam meia-noite UTC.
 */
function parseGoogleDateTime(dateTime?: string, date?: string): Date | null {
  if (dateTime) {
    return new Date(dateTime);
  }
  if (date) {
    // Evento de dia inteiro: assume meia-noite UTC
    return new Date(`${date}T00:00:00Z`);
  }
  return null;
}

/**
 * Cliente Google Calendar para um usuario especifico.
 *
 * Exemplo de uso:
 * ```ts
 * const client = await getCalendarClient(userId);
 * const events = await client.listEvents(new Date(), new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
 * ```
 */
export async function getCalendarClient(userId: string): Promise<{
  listEvents: (timeMin: Date, timeMax: Date) => Promise<GoogleCalendarEvent[]>;
  fullSync: (timeMin: Date, timeMax: Date) => Promise<CalendarSyncResult>;
  watchEvents: (webhookUrl: string, channelId: string, channelToken: string) => Promise<WatchChannel>;
  stopWatch: (channelId: string, resourceId: string) => Promise<void>;
  syncIncremental: (syncToken: string) => Promise<CalendarSyncResult>;
}> {
  // 1. Le a credencial do banco
  const credential = await prisma.googleCalendarCredential.findUnique({
    where: { userId },
  });

  if (!credential) {
    throw new AppError('GOOGLE_CREDENTIAL_NOT_FOUND', 'Credencial do Google Calendar nao encontrada para este usuario.', 404);
  }

  // 2. Decifra o refresh token
  let refreshToken: string;
  try {
    refreshToken = decryptCredential(credential.refreshTokenEnc);
  } catch {
    throw new AppError('GOOGLE_REFRESH_TOKEN_INVALID', 'Falha ao decifrar refresh token do Google.', 401);
  }

  // 3. Obtem access token
  const { accessToken } = await refreshAccessToken(refreshToken);

  // 4. Retorna interface com todos os metodos
  return {
    async listEvents(timeMin: Date, timeMax: Date): Promise<GoogleCalendarEvent[]> {
      const timeMinISO = timeMin.toISOString();
      const timeMaxISO = timeMax.toISOString();
      return fetchAllEvents(accessToken, timeMinISO, timeMaxISO);
    },

    async fullSync(timeMin: Date, timeMax: Date): Promise<CalendarSyncResult> {
      return fetchEventChanges(accessToken, { timeMin, timeMax });
    },

    async watchEvents(webhookUrl: string, channelId: string, channelToken: string): Promise<WatchChannel> {
      return watchEvents(accessToken, webhookUrl, channelId, channelToken);
    },

    async stopWatch(channelId: string, resourceId: string): Promise<void> {
      return stopEventsWatch(accessToken, channelId, resourceId);
    },

    async syncIncremental(syncToken: string): Promise<CalendarSyncResult> {
      return fetchEventChanges(accessToken, { syncToken });
    },
  };
}

/**
 * Versao simplificada que retorna apenas eventos ocupados (transparency=opaque ou ausente),
 * ja convertidos para intervalos Date, excluindo eventos de dia inteiro.
 *
 * Esta funcao e usada pelo servico de sincronizacao.
 */
export async function listBusyEvents(
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<Array<{
  id: string;
  status: 'confirmed' | 'cancelled' | 'tentative';
  startAt: Date;
  endAt: Date;
  /** true se o evento NAO bloqueia a agenda (transparency=transparent). */
  isTransparent: boolean;
}>> {
  const client = await getCalendarClient(userId);
  const rawEvents = await client.listEvents(timeMin, timeMax);

  const result: Array<{
    id: string;
    status: 'confirmed' | 'cancelled' | 'tentative';
    startAt: Date;
    endAt: Date;
    isTransparent: boolean;
  }> = [];

  for (const event of rawEvents) {
    // Ignora eventos de dia inteiro (sem dateTime)
    if (!event.start.dateTime || !event.end.dateTime) {
      continue;
    }

    const startAt = parseGoogleDateTime(event.start.dateTime);
    const endAt = parseGoogleDateTime(event.end.dateTime);

    if (!startAt || !endAt) {
      continue;
    }

    result.push({
      id: event.id,
      status: event.status,
      startAt,
      endAt,
      isTransparent: event.transparency === 'transparent',
    });
  }

  return result;
}
