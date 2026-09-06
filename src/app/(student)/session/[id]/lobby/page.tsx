'use client'

import { useCallback, useMemo, useSyncExternalStore, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DeviceTest, type EquipmentCheckResult, type OverallStatus } from '@/components/session/DeviceTest'
import {
  EQUIPMENT_FAILURE_LABEL,
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
 */
export default function SessionLobbyPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
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
      setSaveWarning(
        writeLastEquipmentCheck(next)
          ? null
          : 'Resultado válido nesta sessão. O navegador bloqueou o armazenamento local.',
      )
      setLastCheckOverride(next)
    },
    [sessionId],
  )

  const handleEnter = useCallback(() => {
    if (!sessionId) return
    router.push(`/session/${sessionId}`)
  }, [router, sessionId])

  return (
    <main data-testid="page-session-lobby" className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <header data-testid="session-lobby-header" className="mb-6">
        <h1 className="text-2xl font-bold">Lobby da aula</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirme que seu equipamento está pronto antes de entrar na sala.
        </p>
      </header>

      {!showTest && (
        <section data-testid="session-lobby-last-check" className="rounded-lg border bg-card p-4">
          {lastCheck ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Último teste</h2>
                <StatusBadge status={lastCheck.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                Realizado em {formatWhen(lastCheck.at)}.
              </p>
              {lastCheck.failedChecks.length > 0 ? (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  Pontos pendentes:{' '}
                  {lastCheck.failedChecks.map((f) => EQUIPMENT_FAILURE_LABEL[f]).join(', ')}.
                  Recomendamos refazer o teste.
                </div>
              ) : (
                <p className="text-sm text-green-700 dark:text-green-400">
                  Equipamento aprovado no último teste.
                </p>
              )}
            </div>
          ) : (
            <div data-testid="session-lobby-empty" className="space-y-2">
              <h2 className="font-semibold">Nenhum teste recente</h2>
              <p className="text-sm text-muted-foreground">
                Você ainda não testou seu equipamento. Rode o teste antes de entrar.
              </p>
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
            {lastCheck ? 'Refazer teste' : 'Testar equipamento'}
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
              <span>
                Entendo que a conexão pode instabilizar e quero entrar na sala mesmo assim.
              </span>
            </label>
          )}
          <button
            type="button"
            data-testid="session-lobby-finish-test-button"
            onClick={() => setShowTest(false)}
            className="rounded border px-4 py-2 text-sm"
          >
            Concluir teste
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
          Voltar
        </button>
        <button
          type="button"
          data-testid="session-lobby-enter-button"
          onClick={handleEnter}
          disabled={!canEnter}
          className="rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Entrar na sala
        </button>
      </div>

      <p className="mt-6 text-xs text-muted-foreground" aria-live="polite">
        {saveWarning
          ? saveWarning
          : <>Status atual: <span className="font-medium uppercase">{effectiveStatus}</span></>}
      </p>
    </main>
  )
}

function subscribeLastCheck() {
  return () => {}
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function StatusBadge({ status }: { status: LastEquipmentCheck['status'] }) {
  const map: Record<LastEquipmentCheck['status'], { cls: string; label: string }> = {
    ok: { cls: 'bg-green-500/15 text-green-700 dark:text-green-400', label: 'Aprovado' },
    warning: { cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'Atenção' },
    fail: { cls: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Falha' },
    checking: { cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'Testando' },
    idle: { cls: 'bg-muted text-muted-foreground', label: 'Aguardando' },
  }
  const s = map[status]
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
}
