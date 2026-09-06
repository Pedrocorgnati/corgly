'use client';

import { useEffect, useState } from 'react';

type Step = {
  key: string;
  label: string;
  event: string;
  count: number;
  conversion: number | null;
  dropoff: number | null;
};

type FunnelResponse = {
  period: string;
  from: string;
  to: string;
  steps: Step[];
};

const PERIODS = ['7d', '30d', '90d'] as const;

export function AnalyticsFunnel() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('30d');
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/admin/analytics/funnel?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then((j: FunnelResponse) => { if (!cancelled) setData(j); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  const maxCount = data ? Math.max(...data.steps.map((s) => s.count), 1) : 1;

  return (
    <section data-testid="admin-analytics-funnel" className="rounded-lg border bg-card p-6">
      <header data-testid="admin-analytics-funnel-header" className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Funil de Conversao</h2>
          <p className="text-sm text-muted-foreground">
            Visitantes -&gt; Cadastros -&gt; Checkout -&gt; Compras
          </p>
        </div>
        <div data-testid="admin-analytics-funnel-period-tabs" className="flex gap-1 rounded-md border p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              data-testid={`admin-analytics-funnel-period-${p}-button`}
              type="button"
              onClick={() => setPeriod(p)}
              className={
                'px-3 py-1 text-sm rounded ' +
                (p === period ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')
              }
              aria-pressed={p === period}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      {loading && <div data-testid="admin-analytics-funnel-loading" className="text-sm text-muted-foreground">Carregando...</div>}
      {error && (
        <div data-testid="admin-analytics-funnel-error" className="text-sm text-destructive">
          Erro ao carregar funil: {error}
        </div>
      )}
      {!loading && !error && data && data.steps.every((s) => s.count === 0) && (
        <div data-testid="admin-analytics-funnel-empty" className="text-sm text-muted-foreground">
          Sem eventos no periodo. Instrumentacao pode estar pendente ou aguardando dados.
        </div>
      )}

      {!loading && !error && data && (
        <ol data-testid="admin-analytics-funnel-steps" className="space-y-3">
          {data.steps.map((s) => {
            const widthPct = Math.max(4, Math.round((s.count / maxCount) * 100));
            return (
              <li key={s.key} data-testid={`admin-analytics-funnel-step-${s.key}`}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {s.count.toLocaleString('pt-BR')}
                    {s.conversion != null && (
                      <>
                        {' '}
                        <span className="text-emerald-600">
                          ({(s.conversion * 100).toFixed(1)}%)
                        </span>
                        {s.dropoff != null && s.dropoff > 0 && (
                          <span className="ml-2 text-destructive">
                            drop -{(s.dropoff * 100).toFixed(1)}%
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                <div className="h-3 w-full rounded bg-muted">
                  <div
                    className="h-3 rounded bg-primary"
                    style={{ width: widthPct + '%' }}
                    aria-label={`${s.label}: ${s.count}`}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
