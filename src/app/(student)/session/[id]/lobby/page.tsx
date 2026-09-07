'use client'

import { useCallback, useMemo, useSyncExternalStore, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { DeviceTest, type EquipmentCheckResult, type OverallStatus } from '@/components/session/DeviceTest'
import {
  EQUIPMENT_FAILURE_LABEL_KEY,
  parseLastEquipmentCheck,
  readLastEquipmentCheckRaw,
  writeLastEquipmentCheck,
  type LastEquipmentCheck,
} from '@/lib/equipment/last-check.client'

/**
 * Lobby da sala (ST-29): exibe o último equipment check e permite refazê-lo
 * antes de entrar na aula. Reusa o resultado do onboarding (ON-10) quando
 * existe; caso contrário convida a rodar o teste. O CTA de entrada só libera
 * com status ok (ou warning confirmado).
 *
 * COPY: toda a tela sai de `sessionLobby.*` (e os rótulos de falha de
 * `onboarding.equipment.failure.*`, catálogo compartilhado com o onboarding).
 * Estava fixa em pt-BR — inclusive a data, formatada com `toLocaleString('pt-BR')`
 * cravado —, então o aluno em en-US/es-ES/it-IT lia a última tela antes da aula
 * ao vivo num idioma que ele não escolheu.
 */
/**
 * Chave de catalogo por status do check. Mapa nomeado em vez de template
 * literal (`t(`status.${x}`)`) de proposito: assim a guarda estatica de i18n
 * consegue expandir os cinco valores e ACUSAR se um deles sumir do catalogo.
 */
const STATUS_LABEL_KEY: Record<OverallStatus, string> = {
  ok: 'status.ok',
  warning: 'status.warning',
  fail: 'status.fail',
  checking: 'status.checking',
  idle: 'status.idle',
}

export default function SessionLobbyPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('sessionLobby')
  const tEquipment = useTranslations('onboarding')
  const locale = useLocale()
  const sessionId = params?.id

  const storedCheckRaw = useSyncExternalStore(
    subscribeLastCheck,
    readLastEquipmentCheckRaw,
    () => null,
  )
  const storedCheck = useMemo(() => parseLastEquipmentCheck(storedCheckRaw), [storedCheckRaw])
  const [lastCheckOverride, setLastCheckOverride] = useState<LastEquipmentCheck | null>(null)
  const [showTest, setShowTest] = useState(false)
  const [liveStatus, setLiveStatus] = useState<OverallStatus>('idle')
  const [confirmedWarning, setConfirmedWarning] = useState(false)
  const [saveWarning, setSaveWarning] = useState<string | null>(null)
  const lastCheck = lastCheckOverride ?? storedCheck

  const effectiveStatus: OverallStatus = showTest
    ? liveStatus
    : ((lastCheck?.status as OverallStatus | undefined) ?? 'idle')

  const canEnter =
    effectiveStatus === 'ok' || (effectiveStatus === 'warning' && confirmedWarning)

  const handleResult = useCallback(
    (r: EquipmentCheckResult) => {
      const next: LastEquipmentCheck = {
        status: r.status,
        failedChecks: r.failedChecks,
        at: r.at,
        sessionId: sessionId ?? undefined,
      }
      setSaveWarning(writeLastEquipmentCheck(next) ? null : t('storageBlocked'))
      setLastCheckOverride(next)
    },
    [sessionId, t],
  )

  const handleEnter = useCallback(() => {
    if (!sessionId) return
    router.push(`/session/${sessionId}`)
  }, [router, sessionId])

  return (
    <main data-testid="page-session-lobby" className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <header data-testid="session-lobby-header" className="mb-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {!showTest && (
        <section data-testid="session-lobby-last-check" className="rounded-lg border bg-card p-4">
          {lastCheck ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{t('lastCheckTitle')}</h2>
                <StatusBadge status={lastCheck.status} label={t(STATUS_LABEL_KEY[lastCheck.status])} />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('lastCheckAt', { when: formatWhen(lastCheck.at, locale) })}
              </p>
              {lastCheck.failedChecks.length > 0 ? (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  {t('pendingPoints', {
                    items: lastCheck.failedChecks
                      .map((f) => tEquipment(EQUIPMENT_FAILURE_LABEL_KEY[f]))
                      .join(', '),
                  })}
                </div>
              ) : (
                <p className="text-sm text-green-700 dark:text-green-400">{t('approved')}</p>
              )}
            </div>
          ) : (
            <div data-testid="session-lobby-empty" className="space-y-2">
              <h2 className="font-semibold">{t('emptyTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('emptyDescription')}</p>
            </div>
          )}
          <button
            type="button"
            data-testid="session-lobby-retest-button"
            onClick={() => {
              setConfirmedWarning(false)
              setShowTest(true)
            }}
            className="mt-4 rounded border px-4 py-2 text-sm hover:bg-accent"
          >
            {lastCheck ? t('retest') : t('runTest')}
          </button>
        </section>
      )}

      {showTest && (
        <section data-testid="session-lobby-device-test" className="space-y-6">
          <DeviceTest
            onReady={setLiveStatus}
            onResult={handleResult}
          />
          {liveStatus === 'warning' && (
            <label data-testid="session-lobby-warning-confirm" className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <input
                type="checkbox"
                checked={confirmedWarning}
                onChange={(e) => setConfirmedWarning(e.target.checked)}
                className="mt-1"
              />
              <span>{t('warningConfirm')}</span>
            </label>
          )}
          <button
            type="button"
            data-testid="session-lobby-finish-test-button"
            onClick={() => setShowTest(false)}
            className="rounded border px-4 py-2 text-sm"
          >
            {t('finishTest')}
          </button>
        </section>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          data-testid="session-lobby-back-button"
          onClick={() => router.back()}
          className="rounded border px-4 py-2 text-sm"
        >
          {t('back')}
        </button>
        <button
          type="button"
          data-testid="session-lobby-enter-button"
          onClick={handleEnter}
          disabled={!canEnter}
          className="rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {t('enter')}
        </button>
      </div>

      <p className="mt-6 text-xs text-muted-foreground" aria-live="polite">
        {saveWarning
          ? saveWarning
          : <>{t('currentStatus')} <span className="font-medium uppercase">{t(STATUS_LABEL_KEY[effectiveStatus])}</span></>}
      </p>
    </main>
  )
}

function subscribeLastCheck() {
  return () => {}
}

/** Data do ultimo teste no locale ativo — nao no pt-BR cravado de antes. */
function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * O rotulo chega TRADUZIDO por quem renderiza (`sessionLobby.status.*`); aqui
 * fica so a cor. Antes o texto morava neste mapa, em pt-BR, fora do catalogo.
 */
function StatusBadge({ status, label }: { status: LastEquipmentCheck['status']; label: string }) {
  const cls: Record<LastEquipmentCheck['status'], string> = {
    ok: 'bg-green-500/15 text-green-700 dark:text-green-400',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    fail: 'bg-red-500/15 text-red-700 dark:text-red-400',
    checking: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    idle: 'bg-muted text-muted-foreground',
  }
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls[status]}`}>{label}</span>
}
