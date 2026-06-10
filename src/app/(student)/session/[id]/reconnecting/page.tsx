'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import { useAuth } from '@/hooks/useAuth'
import { ROUTES, API } from '@/lib/constants/routes'
import { apiClient } from '@/lib/api-client'
import {
  recordHealthTransition,
  formatReconnectCountdown,
  RECONNECT_WINDOW_SECONDS,
} from '@/lib/sessions/session-health.client'
import { SessionFallbackControls } from '@/components/session/SessionFallbackControls'

/**
 * Tela de fallback de reconexão (ST-48, P0).
 *
 * Mostra a janela canônica de 2 minutos para a conexão se restabelecer e oferece
 * as ações de escape: tentar reconectar agora, falar com suporte ou interromper.
 * Cada transição emite um health event:
 *   - entrada na tela / tentativa manual -> RECONNECT_ATTEMPT
 *   - interrupção manual ou expiração da janela -> RECONNECT_FAILED
 *
 * O sucesso da reconexão é detectado na própria sala (useReconnect): ao "tentar
 * reconectar agora" voltamos para a rota da sessão, onde o restabelecimento real
 * acontece. Esgotada a janela, a sessão é interrompida (crédito reembolsado).
 */
export default function SessionReconnectingPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { role, isLoading } = useAuth()
  const sessionId = params?.id

  const [countdown, setCountdown] = useState(RECONNECT_WINDOW_SECONDS)
  const [attemptCount, setAttemptCount] = useState(1)
  const [isBusy, setIsBusy] = useState(false)
  const [healthNotice, setHealthNotice] = useState<string | null>(null)

  const entryRecordedRef = useRef(false)
  const finalizedRef = useRef(false)
  const attemptRef = useRef(1)

  // ── Registro da tentativa inicial de reconexão ─────────────────────────────
  useEffect(() => {
    if (!sessionId || isLoading || entryRecordedRef.current) return
    entryRecordedRef.current = true

    void recordHealthTransition({
      sessionId,
      role,
      eventType: 'RECONNECT_ATTEMPT',
      webrtcState: 'DISCONNECTED',
      reconnectAttempt: 1,
      reconnectReason: 'connection_lost',
    }).then((ok) => {
      if (!ok) {
        setHealthNotice(
          'Não foi possível registrar a tentativa de reconexão, mas seguimos tentando.',
        )
      }
    })
  }, [sessionId, role, isLoading])

  // ── Finalização (interrupção manual OU expiração da janela) ────────────────
  const finalizeInterrupt = useCallback(
    async (origin: 'manual' | 'timeout') => {
      if (!sessionId || finalizedRef.current) return
      finalizedRef.current = true
      setIsBusy(true)

      await recordHealthTransition({
        sessionId,
        role,
        eventType: 'RECONNECT_FAILED',
        webrtcState: 'FAILED',
        reconnectAttempt: attemptRef.current,
        reconnectReason: origin === 'timeout' ? 'reconnect_window_expired' : 'user_interrupted',
      })

      try {
        await apiClient.patch(API.SESSION_INTERRUPT(sessionId), {
          reason: 'connection_lost',
        })
      } catch (err) {
        console.error('[reconnecting] Falha ao interromper sessão:', err)
        toast.error('Não foi possível encerrar a sessão no servidor. Tente novamente.')
        finalizedRef.current = false
        setIsBusy(false)
        return
      }

      // A rota da sessão renderiza o estado INTERRUPTED (com reembolso do crédito).
      router.push(ROUTES.SESSION(sessionId))
    },
    [sessionId, role, router],
  )

  // ── Countdown de 2 minutos ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || isLoading) return

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          void finalizeInterrupt('timeout')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionId, isLoading, finalizeInterrupt])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleRetryConnection = useCallback(async () => {
    if (!sessionId || isBusy || finalizedRef.current) return
    setIsBusy(true)

    const nextAttempt = attemptRef.current + 1
    attemptRef.current = nextAttempt
    setAttemptCount(nextAttempt)

    await recordHealthTransition({
      sessionId,
      role,
      eventType: 'RECONNECT_ATTEMPT',
      webrtcState: 'CHECKING',
      reconnectAttempt: nextAttempt,
      reconnectReason: 'manual_retry',
    })

    router.push(ROUTES.SESSION(sessionId))
  }, [sessionId, role, isBusy, router])

  const handleSupport = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.open(ROUTES.SUPPORT, '_blank', 'noopener,noreferrer')
    }
  }, [])

  const handleInterrupt = useCallback(() => {
    void finalizeInterrupt('manual')
  }, [finalizeInterrupt])

  // ── Estados de borda ───────────────────────────────────────────────────────

  if (!sessionId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            Sessão não identificada
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Não foi possível localizar esta aula. Volte ao painel e tente novamente.
          </p>
          <Link
            href={ROUTES.DASHBOARD}
            className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-3" aria-live="polite">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Verificando sua conexão...</p>
        </div>
      </main>
    )
  }

  const isUrgent = countdown < 30
  const formatted = formatReconnectCountdown(countdown)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <section
        className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" aria-hidden="true" />

        <h1 className="mt-4 text-xl font-semibold text-foreground">Reconectando...</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conexão caiu. Vamos tentar restabelecer a aula automaticamente nos
          próximos 2 minutos.
        </p>

        <p
          className={cn(
            'mt-4 font-mono text-2xl font-semibold tabular-nums text-foreground',
            isUrgent && 'animate-pulse text-red-500',
          )}
        >
          {formatted}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tentativa {attemptCount} dentro da janela de reconexão
        </p>

        {healthNotice && (
          <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
            {healthNotice}
          </p>
        )}

        <div className="mt-6">
          <SessionFallbackControls
            onRetryConnection={handleRetryConnection}
            onSupport={handleSupport}
            onInterrupt={handleInterrupt}
            interruptLabel="Interromper sessão"
            isBusy={isBusy}
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Se a conexão não voltar, sua sessão será interrompida e 1 crédito será
          devolvido à sua conta.
        </p>
      </section>
    </main>
  )
}
