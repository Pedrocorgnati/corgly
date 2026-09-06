import type { Metadata } from 'next';
import { Activity, AlertTriangle, CheckCircle2, XCircle, Database, CreditCard, Mail, Users2, Radio, ListChecks } from 'lucide-react';
import { PageWrapper } from '@/components/shared';
import {
  collectSystemMetrics,
  deriveAlerts,
  type SubsystemStatus,
  type SubsystemCheck,
  type AlertSeverity,
} from '@/lib/observability/system-health.service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin - Saúde do sistema',
};

const STATUS_STYLE: Record<SubsystemStatus, { label: string; className: string }> = {
  ok:             { label: 'Operacional',     className: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  degraded:       { label: 'Degradado',       className: 'text-amber-600 bg-amber-50 border-amber-200' },
  error:          { label: 'Com falha',       className: 'text-red-600 bg-red-50 border-red-200' },
  not_configured: { label: 'Não configurado', className: 'text-slate-600 bg-slate-50 border-slate-200' },
};

const OVERALL_STYLE: Record<SubsystemStatus, { label: string; className: string }> = {
  ok:             { label: 'Todos os sistemas operacionais', className: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  degraded:       { label: 'Sistema degradado',              className: 'bg-amber-50 border-amber-200 text-amber-800' },
  error:          { label: 'Falha crítica detectada',        className: 'bg-red-50 border-red-200 text-red-800' },
  not_configured: { label: 'Configuração incompleta',        className: 'bg-slate-50 border-slate-200 text-slate-800' },
};

const ALERT_STYLE: Record<AlertSeverity, string> = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  warning:  'border-amber-200 bg-amber-50 text-amber-800',
  info:     'border-sky-200 bg-sky-50 text-sky-800',
};

function StatusBadge({ status }: { status: SubsystemStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

function SubsystemCard({
  icon: Icon,
  name,
  check,
  extra,
  'data-testid': testId,
}: {
  icon: typeof Database;
  name: string;
  check: SubsystemCheck;
  extra?: React.ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div data-testid={testId} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium text-foreground">{name}</span>
        </div>
        <StatusBadge status={check.status} />
      </div>
      <p className="text-sm text-muted-foreground mt-3">{check.detail}</p>
      {check.latencyMs !== undefined && (
        <p className="text-xs text-muted-foreground mt-1">Latência: {check.latencyMs}ms</p>
      )}
      {extra}
    </div>
  );
}

export default async function AdminHealthPage() {
  const metrics = await collectSystemMetrics();
  const alerts = deriveAlerts(metrics);
  const overall = OVERALL_STYLE[metrics.overall];
  const { subsystems, sessionHealth } = metrics;

  return (
    <PageWrapper data-testid="page-admin-health">
      <div data-testid="admin-health-header" className="mb-6 flex items-center gap-3">
        <Activity className="h-6 w-6 text-foreground" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saúde do sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Status dos subsistemas, alertas críticos e qualidade das sessões
          </p>
        </div>
      </div>

      {/* Banner de status geral */}
      <div data-testid="admin-health-overall-status" className={`flex items-center gap-3 rounded-2xl border px-5 py-4 mb-6 ${overall.className}`}>
        {metrics.overall === 'ok' ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : metrics.overall === 'error' ? (
          <XCircle className="h-5 w-5" />
        ) : (
          <AlertTriangle className="h-5 w-5" />
        )}
        <div>
          <p className="font-semibold">{overall.label}</p>
          <p className="text-xs opacity-80">
            Atualizado em {new Date(metrics.generatedAt).toLocaleString('pt-BR')} · ambiente {metrics.environment ?? '-'} · uptime {Math.floor(metrics.uptimeSeconds / 60)}min
          </p>
        </div>
      </div>

      {/* Alertas */}
      <section data-testid="admin-health-alerts" className="mb-8">
        <h2 className="font-semibold text-foreground mb-3">Alertas críticos</h2>
        {alerts.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm text-muted-foreground">Nenhum alerta ativo. Todos os subsistemas estão saudáveis.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {alerts.map((a) => (
              <li key={a.id} data-testid={`admin-health-alert-${a.id}`} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${ALERT_STYLE[a.severity]}`}>
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {a.title}
                    <span className="ml-2 text-xs uppercase opacity-70">{a.severity}</span>
                  </p>
                  <p className="text-sm opacity-90">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Subsistemas */}
      <section data-testid="admin-health-subsystems" className="mb-8">
        <h2 className="font-semibold text-foreground mb-3">Subsistemas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SubsystemCard icon={Database} name="Banco de dados" check={subsystems.db} data-testid="admin-health-subsystem-db" />
          <SubsystemCard icon={CreditCard} name="Pagamentos (Stripe)" check={subsystems.stripe} data-testid="admin-health-subsystem-stripe" />
          <SubsystemCard icon={Mail} name="Email (Resend)" check={subsystems.email} data-testid="admin-health-subsystem-email" />
          <SubsystemCard icon={Users2} name="Colaboração (Hocuspocus)" check={subsystems.hocuspocus} data-testid="admin-health-subsystem-hocuspocus" />
          <SubsystemCard icon={Radio} name="WebRTC (TURN)" check={subsystems.turn} data-testid="admin-health-subsystem-turn" />
          <SubsystemCard
            icon={ListChecks}
            name="Fila de jobs"
            check={{ status: subsystems.jobQueue.status, detail: subsystems.jobQueue.detail }}
            data-testid="admin-health-subsystem-job-queue"
            extra={
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-xs text-muted-foreground">Na fila</dt>
                  <dd className="text-sm font-semibold text-foreground">{subsystems.jobQueue.counts.queued}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rodando</dt>
                  <dd className="text-sm font-semibold text-foreground">{subsystems.jobQueue.counts.running}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Falhas (1h)</dt>
                  <dd className="text-sm font-semibold text-foreground">{subsystems.jobQueue.counts.failed}</dd>
                </div>
              </dl>
            }
          />
        </div>
      </section>

      {/* Session health agregado (sem PII) */}
      <section data-testid="admin-health-session-quality">
        <h2 className="font-semibold text-foreground mb-3">
          Qualidade das sessões (últimas {sessionHealth.windowHours}h)
        </h2>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {sessionHealth.sampleSize === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma métrica de sessão registrada na janela.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
                <Metric label="Sessões monitoradas" value={String(sessionHealth.distinctSessions)} />
                <Metric label="Amostras" value={String(sessionHealth.sampleSize)} />
                <Metric label="Latência média" value={sessionHealth.avgLatencyMs !== null ? `${sessionHealth.avgLatencyMs}ms` : '-'} />
                <Metric label="Pior perda de pacotes" value={sessionHealth.worstPacketLossPercent !== null ? `${sessionHealth.worstPacketLossPercent}%` : '-'} />
              </div>
              <div className="flex flex-wrap gap-2">
                <QualityPill label="Boa" count={sessionHealth.qualityBreakdown.good} className="bg-emerald-50 text-emerald-700 border-emerald-200" />
                <QualityPill label="Instável" count={sessionHealth.qualityBreakdown.unstable} className="bg-amber-50 text-amber-700 border-amber-200" />
                <QualityPill label="Ruim" count={sessionHealth.qualityBreakdown.bad} className="bg-red-50 text-red-700 border-red-200" />
                <QualityPill label="Desconhecida" count={sessionHealth.qualityBreakdown.unknown} className="bg-slate-50 text-slate-700 border-slate-200" />
                <QualityPill label="Reconexões" count={sessionHealth.reconnectEvents} className="bg-sky-50 text-sky-700 border-sky-200" />
              </div>
            </>
          )}
        </div>
      </section>
    </PageWrapper>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

function QualityPill({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
      {label}
      <span className="font-bold">{count}</span>
    </span>
  );
}
