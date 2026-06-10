'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/lib/constants/enums'
import { ROUTES, API } from '@/lib/constants/routes'
import { apiClient } from '@/lib/api-client'
import { recordHealthTransition } from '@/lib/sessions/session-health.client'
import { AudioOnlyOverlay } from '@/components/session/AudioOnlyOverlay'
import { SessionFallbackControls } from '@/components/session/SessionFallbackControls'

/**
 * Tela de fallback audio-only (ST-47, P0).
 *
 * Acionada quando o vídeo falha mas o áudio segue viável: o aluno mantém a aula
 * SEM encerrar a sessão. A tela registra um health event a cada transição
 * (entrada em audio-only, reativação de vídeo, encerramento) e oferece as ações
 * de contingência via `SessionFallbackControls`.
 *
 * O suporte abre em nova aba para não derrubar a sessão ativa; reativar vídeo
 * volta para a sala completa; encerrar interrompe a sessão (crédito reembolsado).
 */
export default function SessionAudioOnlyPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { role, isLoading } = useAuth()
  const sessionId = params?.id

  const [isMuted, setIsMuted] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [healthNotice, setHealthNotice] = useState<string | null>(null)
  const entryRecordedRef = useRef(false)

  const isAdmin = role === UserRole.ADMIN

  // ── Registro da transição de entrada em audio-only ─────────────────────────
  useEffect(() => {
    if (!sessionId) return
    if (isLoading) return
    if (entryRecordedRef.current) return
    entryRecordedRef.current = true

    void recordHealthTransition({
      sessionId,
      role,
      eventType: 'CONNECTION_STATE',
      webrtcState: 'CONNECTED',
      metadata: { mode: 'audio_only', reason: 'video_failed' },
    }).then((ok) => {
      if (!ok) {
        setHealthNotice(
          'Não foi possível registrar o estado da conexão, mas sua aula continua ativa.',
        )
      }
    })
  }, [sessionId, role, isLoading])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleAudio = useCallback(() => {
    setIsMuted((prev) => !prev)
  }, [])

  const handleRetryVideo = useCallback(async () => {
    if (!sessionId || isBusy) return
    setIsBusy(true)
    await recordHealthTransition({
      sessionId,
      role,
      eventType: 'CONNECTION_STATE',
      webrtcState: 'CONNECTED',
      metadata: { mode: 'video', action: 'retry_video' },
    })
    router.push(ROUTES.SESSION(sessionId))
  }, [sessionId, role, isBusy, router])

  const handleSupport = useCallback(() => {
    // Abrir em nova aba preserva a sessão de áudio em andamento.
    if (typeof window !== 'undefined') {
      window.open(ROUTES.SUPPORT, '_blank', 'noopener,noreferrer')
    }
  }, [])

  const handleInterrupt = useCallback(async () => {
    if (!sessionId || isBusy) return
    setIsBusy(true)

    await recordHealthTransition({
      sessionId,
      role,
      eventType: 'CONNECTION_STATE',
      webrtcState: 'CLOSED',
      metadata: { action: 'interrupt', source: 'audio_only' },
    })

    try {
      await apiClient.patch(API.SESSION_INTERRUPT(sessionId), {
        reason: 'connection_lost',
      })
    } catch (err) {
      console.error('[audio-only] Falha ao interromper sessão:', err)
      toast.error('Não foi possível encerrar a sessão no servidor. Tente novamente.')
      setIsBusy(false)
      return
    }

    router.push(ROUTES.SESSION(sessionId))
  }, [sessionId, role, isBusy, router])

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
          <WifiOff className="h-10 w-10 animate-pulse text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Preparando o modo apenas áudio...</p>
        </div>
      </main>
    )
  }

  const peerName = isAdmin ? 'Aluno' : 'Professor'
  const peerInitials = isAdmin ? 'AL' : 'PR'

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Banner de contexto */}
      <header className="border-b border-border bg-yellow-500/10 px-4 py-3 text-center">
        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
          O vídeo está indisponível. Você continua na aula em modo apenas áudio.
        </p>
      </header>

      {/* Conteúdo principal: avatar + waveform */}
      <section className="flex flex-1 items-center justify-center p-4">
        <div className="h-72 w-full max-w-md overflow-hidden rounded-xl border border-border">
          <AudioOnlyOverlay
            peerName={peerName}
            peerInitials={peerInitials}
            isAudioActive={!isMuted}
          />
        </div>
      </section>

      {/* Aviso não-bloqueante de telemetria */}
      {healthNotice && (
        <p
          className="px-4 pb-2 text-center text-xs text-muted-foreground"
          aria-live="polite"
        >
          {healthNotice}
        </p>
      )}

      {/* Controles de contingência */}
      <footer className="border-t border-border bg-card px-4 py-4">
        <SessionFallbackControls
          isMuted={isMuted}
          onToggleAudio={handleToggleAudio}
          onRetryVideo={handleRetryVideo}
          onSupport={handleSupport}
          onInterrupt={handleInterrupt}
          isBusy={isBusy}
        />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Sua sessão permanece ativa. Reative o vídeo assim que sua conexão melhorar.
        </p>
      </footer>
    </main>
  )
}
