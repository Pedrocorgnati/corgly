'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DeviceTest, type EquipmentCheckResult, type OverallStatus } from '@/components/session/DeviceTest'
import { ROUTES } from '@/lib/constants/routes'
import {
  EQUIPMENT_FAILURE_LABEL_KEY,
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
 *
 * O teste NÃO é cadeado de acesso ao produto. Todo estado tem saída:
 *   - 'ok'                → Continuar liberado direto;
 *   - 'warning' e 'fail'  → Continuar liberado após ciência explícita, com
 *                           orientação de correção e ação de refazer o teste;
 *   - qualquer estado     → link de "pular por agora" para o painel.
 * Antes, 'fail' (permissão negada, sem webcam ou rede reprovada) deixava o
 * botão desabilitado para sempre: quem negasse a permissão da câmera ficava
 * preso nesta tela, sem chegar ao painel nem conseguir agendar aula. O
 * onboarding já foi concluído na tela anterior, então nenhum passo obrigatório
 * fica para trás ao sair daqui.
 */
export default function OnboardingEquipmentCheckPage() {
  const router = useRouter()
  const t = useTranslations('onboarding')
  const [status, setStatus] = useState<OverallStatus>('idle')
  const [result, setResult] = useState<EquipmentCheckResult | null>(null)
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false)
  const [guides, setGuides] = useState<Guide[]>([])
  const [guidesError, setGuidesError] = useState<string | null>(null)
  const [saveWarning, setSaveWarning] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Trocar a key remonta o DeviceTest: o hook de dispositivo derruba o stream no
  // cleanup e volta para 'idle', permitindo uma nova tentativa limpa depois de
  // o usuário autorizar a câmera nas configurações do navegador.
  const [attempt, setAttempt] = useState(0)

  const failedChecks = result?.failedChecks ?? []
  const failedChecksKey = result?.failedChecks.join(',') ?? ''
  const guidesLoading = Boolean(failedChecksKey && guides.length === 0 && !guidesError)
  const needsAcknowledgement = status === 'warning' || status === 'fail'
  const canContinue = status === 'ok' || (needsAcknowledgement && acknowledgedRisk)

  // Persiste localmente + audita no backend (best-effort, nunca trava o fluxo).
  const handleResult = useCallback(
    (r: EquipmentCheckResult) => {
      setResult(r)
      const savedLocal = writeLastEquipmentCheck({
        status: r.status,
        failedChecks: r.failedChecks,
        at: r.at,
      })
      setSaveWarning(savedLocal ? null : t('equipment.storage_blocked'))
      if (r.failedChecks.length === 0) {
        setGuides([])
        setGuidesError(null)
      }
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
        .then((res) => {
          if (!res.ok) {
            setSaveWarning(t('equipment.audit_sync_failed'))
          }
        })
        .catch(() => {
          setSaveWarning(t('equipment.audit_sync_failed'))
        })
        .finally(() => setSaving(false))
    },
    [t],
  )

  // Carrega os guias de correção quando surgem falhas.
  useEffect(() => {
    if (!failedChecksKey) return
    let active = true
    fetch('/api/v1/equipment-check/guides')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active || !json?.data?.guides) return
        const failed = new Set(failedChecksKey.split(','))
        setGuides((json.data.guides as Guide[]).filter((g) => failed.has(g.errorType)))
        setGuidesError(null)
      })
      .catch(() => {
        if (!active) return
        setGuides([])
        setGuidesError(t('equipment.guides_error'))
      })
    return () => {
      active = false
    }
  }, [failedChecksKey, t])

  const handleContinue = useCallback(() => {
    router.push(ROUTES.CREDITS)
  }, [router])

  // Zera tudo o que descreve a tentativa anterior e remonta o DeviceTest.
  const handleRetry = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setAcknowledgedRisk(false)
    setGuides([])
    setGuidesError(null)
    setSaveWarning(null)
    setSaving(false)
    setAttempt((n) => n + 1)
  }, [])

  return (
    <main data-testid="page-onboarding-equipment-check" className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <header data-testid="onboarding-equipment-check-header" className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('equipment.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{t('equipment.page_title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('equipment.page_description')}
        </p>
      </header>

      <DeviceTest key={attempt} onReady={setStatus} onResult={handleResult} />

      {status === 'fail' && (
        <section
          data-testid="onboarding-equipment-check-fail"
          className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <h2 className="font-semibold text-destructive">{t('equipment.fail_title')}</h2>
          <p className="mt-1 text-muted-foreground">{t('equipment.fail_description')}</p>
        </section>
      )}

      {failedChecks.length > 0 && (
        <section data-testid="onboarding-equipment-check-guides" className="mt-6 space-y-4">
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">{t('equipment.guides_intro')}</p>
            <ul className="mt-1 list-disc pl-5">
              {failedChecks.map((f) => (
                <li key={f}>{t(EQUIPMENT_FAILURE_LABEL_KEY[f])}</li>
              ))}
            </ul>
          </div>
          {guidesLoading && (
            <p data-testid="onboarding-equipment-check-loading" className="text-sm text-muted-foreground" aria-live="polite">
              {t('equipment.guides_loading')}
            </p>
          )}
          {guidesError && (
            <div data-testid="onboarding-equipment-check-error" className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {guidesError}
            </div>
          )}
          {guides.map((g) => (
            <article key={g.errorType} data-testid={`onboarding-equipment-check-guide-${g.errorType}`} className="rounded-lg border bg-card p-4">
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

      {needsAcknowledgement && (
        <label data-testid="onboarding-equipment-check-warning-confirm" className="mt-6 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <input
            type="checkbox"
            checked={acknowledgedRisk}
            onChange={(e) => setAcknowledgedRisk(e.target.checked)}
            className="mt-1"
          />
          <span>
            {status === 'fail'
              ? t('equipment.acknowledge_fail')
              : t('equipment.acknowledge_warning')}
          </span>
        </label>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {saving
            ? t('equipment.saving')
            : saveWarning
              ? saveWarning
              : result
                ? t('equipment.status', { status: status.toUpperCase() })
                : t('equipment.idle')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {needsAcknowledgement && (
            <button
              type="button"
              data-testid="onboarding-equipment-check-retry-button"
              onClick={handleRetry}
              className="rounded border px-4 py-2 text-sm font-medium"
            >
              {t('equipment.retry')}
            </button>
          )}
          <button
            type="button"
            data-testid="onboarding-equipment-check-continue-button"
            onClick={handleContinue}
            disabled={!canContinue}
            className="rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {t('equipment.continue')}
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {t('equipment.retest_note')}{' '}
        <Link
          data-testid="onboarding-equipment-check-skip-link"
          href={ROUTES.DASHBOARD}
          className="font-medium text-primary hover:underline"
        >
          {t('equipment.skip')}
        </Link>
      </p>
    </main>
  )
}
