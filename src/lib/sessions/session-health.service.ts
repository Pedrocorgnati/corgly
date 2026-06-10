import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { UserRole, SessionStatus } from '@/lib/constants/enums';
import {
  type ClientSessionHealthEvent,
  type SessionHealthEventType,
  type WebRtcConnectionState,
} from './session-health.schema';

/**
 * Service de session health (T-026, PRD §12.4.1 realtime operacional / §12.4.4).
 *
 * O cliente WebRTC envia, em lote, eventos JA normalizados de latencia, jitter,
 * packet loss, estado da conexao e tentativas de reconnect. Este service:
 *   1. autoriza o acesso (aluno dono da sessao OU ADMIN, espelhando
 *      `session-entry-token.service` e `session-notes.service`);
 *   2. persiste apenas os campos canonicos do dominio, descartando payload
 *      excessivo (metadata e truncada a um teto de bytes/keys) - "agrega sem
 *      armazenar payload excessivo";
 *   3. deriva um estado de qualidade unico (good/unstable/bad/unknown) a partir
 *      dos eventos recentes, consumido pelo `ConnectionIndicator`.
 *
 * Zero Assumido: a plataforma single-tutor nao tem papel TUTOR dedicado; o
 * professor e o suporte colapsam em `ADMIN`, identico aos services irmaos.
 */

/** Teto de eventos aceitos por request (anti payload excessivo / abuse). */
export const MAX_HEALTH_EVENTS_PER_REQUEST = 50;
/** Teto de bytes da metadata serializada persistida por evento. */
export const MAX_METADATA_BYTES = 2048;
/** Teto de chaves preservadas na metadata (descarta o resto, Zero Assumido). */
export const MAX_METADATA_KEYS = 16;
/** Janela de eventos recentes usada para derivar o estado agregado. */
export const HEALTH_SUMMARY_WINDOW = 25;

/** Statuses em que faz sentido coletar health (sala ativa). */
const ACTIVE_SESSION_STATUSES: readonly string[] = [
  SessionStatus.SCHEDULED,
  SessionStatus.IN_PROGRESS,
];

/** Estados WebRTC considerados "conectado" para fins de qualidade. */
const CONNECTED_STATES: readonly WebRtcConnectionState[] = ['CONNECTED', 'COMPLETED'];
/** Estados WebRTC terminais/ruins. */
const BAD_STATES: readonly WebRtcConnectionState[] = ['DISCONNECTED', 'FAILED', 'CLOSED'];

export type ConnectionQuality = 'good' | 'unstable' | 'bad' | 'unknown';

/**
 * Estado de conexao normalizado para o cliente (`ConnectionIndicator` consome
 * `RTCConnectionState` em minusculas). Mapeia o enum WebRTC do dominio para o
 * vocabulario do componente sem acoplar os dois.
 */
export type DerivedConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

export interface SessionHealthSummary {
  sessionId: string;
  /** Estado normalizado para o ConnectionIndicator. */
  connectionState: DerivedConnectionState;
  /** Qualidade derivada das metricas recentes. */
  quality: ConnectionQuality;
  /** RTT medio (ms) na janela recente, ou null se sem snapshot. */
  rtt: number | null;
  /** Pior packet loss (%) na janela recente, ou null se sem snapshot. */
  packetLoss: number | null;
  /** Total de tentativas de reconnect na janela recente. */
  reconnectAttempts: number;
  /** Instante do evento mais recente, ou null se sem eventos. */
  lastEventAt: string | null;
  /** Quantidade de eventos considerados na janela. */
  sampleSize: number;
}

export type AuthorizeSessionHealthResult =
  | { ok: true }
  | { ok: false; status: 403 | 404; reason: string };

export interface AuthorizeSessionHealthInput {
  sessionId: string;
  userId: string;
  role: string;
  /** Injetavel para testabilidade. Default: agora. */
  now?: Date;
}

/**
 * Valida existencia da sessao + participacao. Nao lanca: retorna resultado
 * discriminado para o route mapear status (404 ausente, 403 demais).
 */
export async function authorizeSessionHealth({
  sessionId,
  userId,
  role,
}: AuthorizeSessionHealthInput): Promise<AuthorizeSessionHealthResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { studentId: true, status: true },
  });

  if (!session) {
    return { ok: false, status: 404, reason: 'session_not_found' };
  }

  const isParticipant = session.studentId === userId || role === UserRole.ADMIN;
  if (!isParticipant) {
    return { ok: false, status: 403, reason: 'not_participant' };
  }

  if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
    return { ok: false, status: 403, reason: 'session_not_active' };
  }

  return { ok: true };
}

/**
 * Trunca a metadata para conter o tamanho persistido (anti payload excessivo).
 * Preserva no maximo `MAX_METADATA_KEYS` chaves e descarta o objeto inteiro se
 * a serializacao ultrapassar `MAX_METADATA_BYTES`. Retorna null quando vazia.
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  const entries = Object.entries(metadata).slice(0, MAX_METADATA_KEYS);
  if (entries.length === 0) {
    return null;
  }

  const trimmed = Object.fromEntries(entries);
  const serialized = JSON.stringify(trimmed);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_BYTES) {
    // Payload acima do teto: descarta metadata, preserva so as metricas canonicas.
    return null;
  }

  return trimmed;
}

export interface RecordSessionHealthEventsInput {
  /** sessionId autoritativo (vem do path, nao do corpo). */
  sessionId: string;
  /** Eventos JA normalizados pelo `clientSessionHealthEventSchema`. */
  events: ClientSessionHealthEvent[];
}

export interface RecordSessionHealthEventsResult {
  recorded: number;
  summary: SessionHealthSummary;
}

/**
 * Persiste o lote de eventos (cap em `MAX_HEALTH_EVENTS_PER_REQUEST`) e devolve
 * o estado agregado atual. Usa `createMany` (single round-trip) e nunca lanca em
 * lote vazio - apenas recalcula o summary.
 */
export async function recordSessionHealthEvents({
  sessionId,
  events,
}: RecordSessionHealthEventsInput): Promise<RecordSessionHealthEventsResult> {
  const capped = events.slice(0, MAX_HEALTH_EVENTS_PER_REQUEST);

  if (capped.length > 0) {
    await prisma.sessionHealth.createMany({
      data: capped.map((event) => ({
        sessionId,
        participantId: event.participantId ?? null,
        participantRole: event.participantRole,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        latencyMs: event.latencyMs ?? null,
        jitterMs: event.jitterMs ?? null,
        packetLossPercent: event.packetLossPercent ?? null,
        webrtcState: event.webrtcState,
        reconnectAttempt: event.reconnectAttempt,
        reconnectReason: event.reconnectReason ?? null,
        reconnectSuccessful: event.reconnectSuccessful ?? null,
        metadata:
          (sanitizeMetadata(event.metadata) as Prisma.InputJsonValue | null) ?? undefined,
      })),
    });
  }

  const summary = await getSessionHealthSummary(sessionId);
  return { recorded: capped.length, summary };
}

/** Mapeia o enum WebRTC do dominio para o vocabulario do ConnectionIndicator. */
function mapConnectionState(state: WebRtcConnectionState): DerivedConnectionState {
  if (CONNECTED_STATES.includes(state)) {
    return 'connected';
  }
  if (state === 'FAILED') {
    return 'failed';
  }
  if (state === 'DISCONNECTED' || state === 'CLOSED') {
    return 'disconnected';
  }
  if (state === 'CHECKING') {
    return 'connecting';
  }
  return 'new';
}

export interface DeriveConnectionQualityInput {
  webrtcState: WebRtcConnectionState;
  latencyMs: number | null;
  packetLossPercent: number | null;
}

/**
 * Deriva a qualidade unica a partir do estado + metricas recentes. Espelha os
 * limiares do `ConnectionIndicator` (RTT >300 / loss >5 = ruim; RTT 150-300 /
 * loss 2-5 = instavel) para coerencia entre servidor e cliente.
 */
export function deriveConnectionQuality({
  webrtcState,
  latencyMs,
  packetLossPercent,
}: DeriveConnectionQualityInput): ConnectionQuality {
  if (BAD_STATES.includes(webrtcState)) {
    return 'bad';
  }
  if (!CONNECTED_STATES.includes(webrtcState)) {
    return 'unknown';
  }

  if (latencyMs === null && packetLossPercent === null) {
    return 'unknown';
  }

  const rttBad = latencyMs !== null && latencyMs > 300;
  const lossBad = packetLossPercent !== null && packetLossPercent > 5;
  if (rttBad || lossBad) {
    return 'bad';
  }

  const rttUnstable = latencyMs !== null && latencyMs >= 150 && latencyMs <= 300;
  const lossUnstable =
    packetLossPercent !== null && packetLossPercent >= 2 && packetLossPercent <= 5;
  if (rttUnstable || lossUnstable) {
    return 'unstable';
  }

  return 'good';
}

const EMPTY_SUMMARY = (sessionId: string): SessionHealthSummary => ({
  sessionId,
  connectionState: 'new',
  quality: 'unknown',
  rtt: null,
  packetLoss: null,
  reconnectAttempts: 0,
  lastEventAt: null,
  sampleSize: 0,
});

/**
 * Le os `HEALTH_SUMMARY_WINDOW` eventos mais recentes e deriva o estado
 * agregado. RTT = media dos snapshots com latencia; packet loss = pior caso;
 * estado/qualidade = derivados do snapshot mais recente com metrica.
 */
export async function getSessionHealthSummary(
  sessionId: string,
): Promise<SessionHealthSummary> {
  const events = await prisma.sessionHealth.findMany({
    where: { sessionId },
    orderBy: { occurredAt: 'desc' },
    take: HEALTH_SUMMARY_WINDOW,
    select: {
      occurredAt: true,
      eventType: true,
      latencyMs: true,
      packetLossPercent: true,
      webrtcState: true,
      reconnectAttempt: true,
    },
  });

  if (events.length === 0) {
    return EMPTY_SUMMARY(sessionId);
  }

  const latest = events[0];
  const latencies = events
    .map((event) => event.latencyMs)
    .filter((value): value is number => value !== null && value !== undefined);
  const losses = events
    .map((event) => (event.packetLossPercent === null ? null : Number(event.packetLossPercent)))
    .filter((value): value is number => value !== null && !Number.isNaN(value));

  const rtt =
    latencies.length > 0
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null;
  const packetLoss = losses.length > 0 ? Math.max(...losses) : null;
  const reconnectAttempts = events.reduce(
    (sum, event) => sum + (isReconnectEvent(event.eventType) ? 1 : 0),
    0,
  );

  return {
    sessionId,
    connectionState: mapConnectionState(latest.webrtcState),
    quality: deriveConnectionQuality({
      webrtcState: latest.webrtcState,
      latencyMs: rtt,
      packetLossPercent: packetLoss,
    }),
    rtt,
    packetLoss,
    reconnectAttempts,
    lastEventAt: latest.occurredAt.toISOString(),
    sampleSize: events.length,
  };
}

function isReconnectEvent(eventType: SessionHealthEventType): boolean {
  return (
    eventType === 'RECONNECT_ATTEMPT' ||
    eventType === 'RECONNECT_SUCCESS' ||
    eventType === 'RECONNECT_FAILED'
  );
}
