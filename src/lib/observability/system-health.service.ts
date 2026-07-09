import 'server-only';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

/**
 * Observability central: agrega o status dos subsistemas (DB, Stripe, email,
 * Hocuspocus, TURN, fila de jobs) + metricas de session health agregadas sem
 * PII e deriva os alertas criticos consumidos por:
 *   - GET /api/v1/admin/observability/metrics
 *   - GET /api/v1/admin/dashboard/alerts
 *   - /admin/health (server component)
 *
 * Regra de privacidade: NENHUMA funcao aqui expoe identificadores de
 * participante, nome, email ou sessionId individual. Session health e sempre
 * agregado (contagens, medias, piores casos) sobre janelas de tempo.
 */

const DB_TIMEOUT_MS = 5000;
const SESSION_HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_QUEUED_JOB_MS = 15 * 60 * 1000;
const RECENT_FAILED_JOB_MS = 60 * 60 * 1000;

export type SubsystemStatus = 'ok' | 'degraded' | 'error' | 'not_configured';

export interface SubsystemCheck {
  status: SubsystemStatus;
  detail: string;
  latencyMs?: number;
}

export interface JobQueueMetrics {
  status: SubsystemStatus;
  detail: string;
  counts: { queued: number; running: number; failed: number };
  staleQueued: number;
  oldestQueuedAgeSeconds: number | null;
}

export interface SessionHealthAggregate {
  windowHours: number;
  sampleSize: number;
  distinctSessions: number;
  avgLatencyMs: number | null;
  worstPacketLossPercent: number | null;
  reconnectEvents: number;
  qualityBreakdown: Record<'good' | 'unstable' | 'bad' | 'unknown', number>;
  connectionStateBreakdown: Record<string, number>;
}

export interface SystemMetrics {
  generatedAt: string;
  environment: string | undefined;
  uptimeSeconds: number;
  overall: SubsystemStatus;
  subsystems: {
    db: SubsystemCheck;
    stripe: SubsystemCheck;
    email: SubsystemCheck;
    hocuspocus: SubsystemCheck;
    turn: SubsystemCheck;
    jobQueue: JobQueueMetrics;
  };
  sessionHealth: SessionHealthAggregate;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface SystemAlert {
  id: string;
  severity: AlertSeverity;
  subsystem: string;
  title: string;
  detail: string;
}

/** Checa conectividade do banco com timeout defensivo (sem vazar erro bruto). */
async function checkDb(): Promise<SubsystemCheck> {
  const start = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS);
        timeoutId.unref?.();
      }),
    ]).finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    });
    return { status: 'ok', detail: 'Conexao saudavel.', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', detail: 'Falha ao consultar o banco.', latencyMs: Date.now() - start };
  }
}

/** Verifica presenca de configuracao (presence-check, sem chamada externa). */
function checkConfigured(value: string | undefined, okDetail: string, missingDetail: string): SubsystemCheck {
  return value
    ? { status: 'ok', detail: okDetail }
    : { status: 'not_configured', detail: missingDetail };
}

/** Estatisticas da fila de jobs persistida (model Job). */
async function checkJobQueue(): Promise<JobQueueMetrics> {
  const now = Date.now();
  const staleThreshold = new Date(now - STALE_QUEUED_JOB_MS);
  const recentFailedThreshold = new Date(now - RECENT_FAILED_JOB_MS);

  try {
    const [queued, running, recentFailed, staleQueued, oldestQueued] = await Promise.all([
      prisma.job.count({ where: { status: 'QUEUED' } }),
      prisma.job.count({ where: { status: 'RUNNING' } }),
      prisma.job.count({ where: { status: 'FAILED', finalErrorAt: { gte: recentFailedThreshold } } }),
      prisma.job.count({ where: { status: 'QUEUED', scheduledAt: { lte: staleThreshold } } }),
      prisma.job.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      }),
    ]);

    const oldestQueuedAgeSeconds = oldestQueued
      ? Math.max(0, Math.round((now - oldestQueued.scheduledAt.getTime()) / 1000))
      : null;

    let status: SubsystemStatus = 'ok';
    let detail = 'Fila saudavel.';
    if (recentFailed > 0 && staleQueued > 0) {
      status = 'error';
      detail = `${recentFailed} jobs falharam na ultima hora e ${staleQueued} estao presos na fila.`;
    } else if (staleQueued > 0) {
      status = 'degraded';
      detail = `${staleQueued} jobs aguardam ha mais de 15 min.`;
    } else if (recentFailed > 0) {
      status = 'degraded';
      detail = `${recentFailed} jobs falharam na ultima hora.`;
    }

    return {
      status,
      detail,
      counts: { queued, running, failed: recentFailed },
      staleQueued,
      oldestQueuedAgeSeconds,
    };
  } catch {
    return {
      status: 'error',
      detail: 'Falha ao consultar a fila de jobs.',
      counts: { queued: 0, running: 0, failed: 0 },
      staleQueued: 0,
      oldestQueuedAgeSeconds: null,
    };
  }
}

/**
 * Agrega session health da ultima janela sem PII: apenas contagens, medias e
 * piores casos. Nunca seleciona participantId/sessionId individualmente.
 */
async function aggregateSessionHealth(): Promise<SessionHealthAggregate> {
  const windowStart = new Date(Date.now() - SESSION_HEALTH_WINDOW_MS);
  const empty: SessionHealthAggregate = {
    windowHours: SESSION_HEALTH_WINDOW_MS / (60 * 60 * 1000),
    sampleSize: 0,
    distinctSessions: 0,
    avgLatencyMs: null,
    worstPacketLossPercent: null,
    reconnectEvents: 0,
    qualityBreakdown: { good: 0, unstable: 0, bad: 0, unknown: 0 },
    connectionStateBreakdown: {},
  };

  try {
    const events = await prisma.sessionHealth.findMany({
      where: { occurredAt: { gte: windowStart } },
      select: {
        sessionId: true,
        latencyMs: true,
        packetLossPercent: true,
        webrtcState: true,
        reconnectAttempt: true,
      },
    });

    if (events.length === 0) return empty;

    const sessionIds = new Set<string>();
    const latencies: number[] = [];
    const qualityBreakdown = { good: 0, unstable: 0, bad: 0, unknown: 0 };
    const connectionStateBreakdown: Record<string, number> = {};
    let worstLoss: number | null = null;
    let reconnectEvents = 0;

    for (const ev of events) {
      sessionIds.add(ev.sessionId);
      if (ev.latencyMs !== null && ev.latencyMs !== undefined) latencies.push(ev.latencyMs);
      const loss = ev.packetLossPercent === null ? null : Number(ev.packetLossPercent);
      if (loss !== null && !Number.isNaN(loss)) {
        worstLoss = worstLoss === null ? loss : Math.max(worstLoss, loss);
      }
      if (ev.reconnectAttempt > 0) reconnectEvents += 1;

      const state = ev.webrtcState as string;
      connectionStateBreakdown[state] = (connectionStateBreakdown[state] ?? 0) + 1;
      qualityBreakdown[classifyQuality(ev.webrtcState, ev.latencyMs ?? null, loss)] += 1;
    }

    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length)
        : null;

    return {
      windowHours: SESSION_HEALTH_WINDOW_MS / (60 * 60 * 1000),
      sampleSize: events.length,
      distinctSessions: sessionIds.size,
      avgLatencyMs,
      worstPacketLossPercent: worstLoss,
      reconnectEvents,
      qualityBreakdown,
      connectionStateBreakdown,
    };
  } catch {
    return empty;
  }
}

/** Classifica qualidade no mesmo criterio de session-health.service. */
function classifyQuality(
  webrtcState: string,
  latencyMs: number | null,
  packetLossPercent: number | null,
): 'good' | 'unstable' | 'bad' | 'unknown' {
  if (webrtcState === 'FAILED' || webrtcState === 'DISCONNECTED' || webrtcState === 'CLOSED') {
    return 'bad';
  }
  if (webrtcState !== 'CONNECTED' && webrtcState !== 'COMPLETED') {
    return 'unknown';
  }
  if (latencyMs === null && packetLossPercent === null) return 'unknown';

  const rttBad = latencyMs !== null && latencyMs > 300;
  const lossBad = packetLossPercent !== null && packetLossPercent > 5;
  if (rttBad || lossBad) return 'bad';

  const rttUnstable = latencyMs !== null && latencyMs >= 150 && latencyMs <= 300;
  const lossUnstable = packetLossPercent !== null && packetLossPercent >= 2 && packetLossPercent <= 5;
  if (rttUnstable || lossUnstable) return 'unstable';

  return 'good';
}

const SEVERITY_RANK: Record<SubsystemStatus, number> = {
  error: 3,
  degraded: 2,
  not_configured: 1,
  ok: 0,
};

/** Reduz os status dos subsistemas a um veredito unico. */
function deriveOverall(statuses: SubsystemStatus[]): SubsystemStatus {
  let worst: SubsystemStatus = 'ok';
  for (const s of statuses) {
    if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}

/** Coleta todas as metricas de sistema de uma vez. */
export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const [db, jobQueue, sessionHealth] = await Promise.all([
    checkDb(),
    checkJobQueue(),
    aggregateSessionHealth(),
  ]);

  const stripe = checkConfigured(
    env.STRIPE_SECRET_KEY,
    'Chave Stripe configurada.',
    'STRIPE_SECRET_KEY ausente: cobrancas indisponiveis.',
  );
  const email = checkConfigured(
    env.RESEND_API_KEY,
    'Provedor de email (Resend) configurado.',
    'RESEND_API_KEY ausente: envios de email indisponiveis.',
  );
  const hocuspocus = checkConfigured(
    env.NEXT_PUBLIC_HOCUSPOCUS_URL,
    'Endpoint Hocuspocus configurado.',
    'NEXT_PUBLIC_HOCUSPOCUS_URL ausente: colaboracao em tempo real indisponivel.',
  );
  const turn = checkConfigured(
    env.TURN_SERVER_SECRET,
    'Servidor TURN configurado.',
    'TURN_SERVER_SECRET ausente: chamadas atras de NAT restrito podem falhar (somente STUN).',
  );

  const overall = deriveOverall([
    db.status,
    stripe.status,
    email.status,
    hocuspocus.status,
    turn.status,
    jobQueue.status,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    overall,
    subsystems: { db, stripe, email, hocuspocus, turn, jobQueue },
    sessionHealth,
  };
}

/** Deriva alertas criticos a partir das metricas coletadas. */
export function deriveAlerts(metrics: SystemMetrics): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  const { subsystems, sessionHealth } = metrics;

  const statusToSeverity = (status: SubsystemStatus): AlertSeverity =>
    status === 'error' ? 'critical' : status === 'not_configured' ? 'warning' : 'warning';

  const pushIfUnhealthy = (key: string, label: string, check: SubsystemCheck) => {
    if (check.status === 'ok') return;
    alerts.push({
      id: `subsystem:${key}`,
      severity: statusToSeverity(check.status),
      subsystem: label,
      title: `${label}: ${check.status}`,
      detail: check.detail,
    });
  };

  pushIfUnhealthy('db', 'Banco de dados', subsystems.db);
  pushIfUnhealthy('stripe', 'Pagamentos (Stripe)', subsystems.stripe);
  pushIfUnhealthy('email', 'Email (Resend)', subsystems.email);
  pushIfUnhealthy('hocuspocus', 'Colaboracao (Hocuspocus)', subsystems.hocuspocus);
  pushIfUnhealthy('turn', 'WebRTC (TURN)', subsystems.turn);

  if (subsystems.jobQueue.status !== 'ok') {
    alerts.push({
      id: 'subsystem:jobQueue',
      severity: subsystems.jobQueue.status === 'error' ? 'critical' : 'warning',
      subsystem: 'Fila de jobs',
      title: `Fila de jobs: ${subsystems.jobQueue.status}`,
      detail: subsystems.jobQueue.detail,
    });
  }

  const totalQuality =
    sessionHealth.qualityBreakdown.good +
    sessionHealth.qualityBreakdown.unstable +
    sessionHealth.qualityBreakdown.bad +
    sessionHealth.qualityBreakdown.unknown;
  if (totalQuality > 0) {
    const badRatio = sessionHealth.qualityBreakdown.bad / totalQuality;
    if (badRatio >= 0.25) {
      alerts.push({
        id: 'session-health:degraded',
        severity: 'critical',
        subsystem: 'Session health',
        title: 'Qualidade de chamada degradada',
        detail: `${Math.round(badRatio * 100)}% das amostras das ultimas ${sessionHealth.windowHours}h estao em qualidade ruim.`,
      });
    } else if (badRatio >= 0.1) {
      alerts.push({
        id: 'session-health:warning',
        severity: 'warning',
        subsystem: 'Session health',
        title: 'Qualidade de chamada instavel',
        detail: `${Math.round(badRatio * 100)}% das amostras das ultimas ${sessionHealth.windowHours}h estao em qualidade ruim.`,
      });
    }
  }

  return alerts;
}
