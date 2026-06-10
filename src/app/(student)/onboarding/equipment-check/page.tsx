'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeviceTest, type EquipmentCheckResult, type OverallStatus } from '@/components/session/DeviceTest'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/lib/constants/routes'
import {
  EQUIPMENT_FAILURE_LABEL,
  writeLastEquipmentCheck,
  type EquipmentFailure,
} from '@/lib/equipment/last-check.client'

interface Guide {
  errorType: EquipmentFailure
  title: string
  steps: string[]
}

/**
 * Onboarding ON-10: teste de equipamento antes da primeira aula/compra.
 *
 * Salva o resultado (localStorage para o lobby + POST best-effort ao backend
 * de auditoria) e, quando há falhas, orienta a correção com guias por tipo de
 * erro (câmera, microfone, permissão, banda) antes de liberar o próximo passo.
 */
export default function OnboardingEquipmentCheckPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [status, setStatus] = useState<OverallStatus>('idle')
  const [result, setResult] = useState<EquipmentCheckResult | null>(null)
  const [confirmedWarning, setConfirmedWarning] = useState(false)
  const [guides, setGuides] = useState<Guide[]>([])
  const [saving, setSaving] = useState(false)

  const failedChecks = result?.failedChecks ?? []
  const canContinue = status === 'ok' || (status === 'warning' && confirmedWarning)

  // Persiste localmente + audita no backend (best-effort, nunca trava o fluxo).
  const handleResult = useCallback(
    (r: EquipmentCheckResult) => {
      setResult(r)
      writeLastEquipmentCheck({
        status: r.status,
        failedChecks: r.failedChecks,
        at: r.at,
      })
      setSaving(true)
      const failed = new Set(r.failedChecks)
      fetch('/api/v1/equipment-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera: { ok: !failed.has('camera') },
          microphone: { ok: !failed.has('microphone') },
          permission: { ok: !failed.has('permission') },
          bandwidthOk: !failed.has('bandwidth'),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : undefined,
        }),
      })
        .catch(() => {
          // Auditoria é best-effort; resultado local já foi gravado.
        })
        .finally(() => setSaving(false))
    },
    [],
  )

  // Carrega os guias de correção quando surgem falhas.
  useEffect(() => {
    if (failedChecks.length === 0) {
      setGuides([])
      return
    }
    let active = true
    fetch('/api/v1/equipment-check/guides')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active || !json?.data?.guides) return
        const failed = new Set(failedChecks)
        setGuides((json.data.guides as Guide[]).filter((g) => failed.has(g.errorType)))
      })
      .catch(() => {
        if (active) setGuides([])
      })
    return () => {
      active = false
    }
  }, [failedChecks.join(',')])

  const handleContinue = useCallback(() => {
    router.push(ROUTES.DASHBOARD)
  }, [router])

  return (
    <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Onboarding
        </p>
        <h1 className="mt-1 text-2xl font-bold">Teste seu equipamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Antes da sua primeira aula, vamos conferir câmera, microfone e conexão.
          Assim você evita surpresas na hora da aula ao vivo.
        </p>
      </header>

      <DeviceTest userId={user?.id ?? 'anonymous'} onReady={setStatus} onResult={handleResult} />

      {failedChecks.length > 0 && (
        <section className="mt-6 space-y-4">
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">Encontramos pontos a ajustar antes de seguir:</p>
            <ul className="mt-1 list-disc pl-5">
              {failedChecks.map((f) => (
                <li key={f}>{EQUIPMENT_FAILURE_LABEL[f]}</li>
              ))}
            </ul>
          </div>
          {guides.map((g) => (
            <article key={g.errorType} className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold">{g.title}</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {g.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
        </section>
      )}

      {status === 'warning' && (
        <label className="mt-6 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <input
            type="checkbox"
            checked={confirmedWarning}
            onChange={(e) => setConfirmedWarning(e.target.checked)}
            className="mt-1"
          />
          <span>
            Entendo que a conexão pode instabilizar (sem TURN/relay ou microfone silencioso)
            e quero seguir mesmo assim.
          </span>
        </label>
      )}

      <div className="mt-8 flex items-center justify-between">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {saving
            ? 'Salvando resultado...'
            : result
              ? `Status: ${status.toUpperCase()}`
              : 'Inicie o teste para verificar seu equipamento.'}
        </p>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className="rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Continuar
        </button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Você poderá refazer este teste a qualquer momento no lobby da sala, antes de cada aula.
      </p>
    </main>
  )
}
