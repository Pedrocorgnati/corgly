'use client'

import { useCallback, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DeviceTest, type OverallStatus } from '@/components/session/DeviceTest'

export default function PreCheckPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<OverallStatus>('idle')
  const [confirmedWarning, setConfirmedWarning] = useState(false)

  const sessionId = params?.id
  const canEnter =
    status === 'ok' || (status === 'warning' && confirmedWarning)

  const handleEnter = useCallback(() => {
    if (!sessionId) return
    router.push(`/session/${sessionId}`)
  }, [router, sessionId])

  return (
    <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Teste pre-aula</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verifique camera, microfone e conexao antes de entrar na sala.
        </p>
      </header>

      <DeviceTest onReady={setStatus} />

      {status === 'warning' && (
        <label className="mt-6 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <input
            type="checkbox"
            checked={confirmedWarning}
            onChange={(e) => setConfirmedWarning(e.target.checked)}
            className="mt-1"
          />
          <span>
            Entendo que a conexao pode instabilizar (sem TURN/relay ou microfone silencioso)
            e quero entrar na sala mesmo assim.
          </span>
        </label>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border px-4 py-2 text-sm"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleEnter}
          disabled={!canEnter}
          className="rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Entrar na aula
        </button>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Status geral: <span className="font-medium uppercase">{status}</span>
      </p>
    </main>
  )
}
