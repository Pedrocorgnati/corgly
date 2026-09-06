'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle, AlertTriangle, Clock, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api-client'

import type { SessionPageState, IceServersConfig } from '@/types/sala-virtual'
import type { SessionClientUser, SessionClientData } from '@/lib/sessions/session-client.types'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useReconnect } from '@/hooks/useReconnect'
import { useSessionAccess } from '@/hooks/useSessionAccess'
import { SessionStatus, UserRole } from '@/lib/constants/enums'
import { ROUTES, API } from '@/lib/constants/routes'
import { useSessionTimer } from '@/hooks/useSessionTimer'
import { useYjsDoc } from '@/hooks/useYjsDoc'
import { useYjsProvider } from '@/hooks/useYjsProvider'

import { VideoPanel } from './VideoPanel'
import { EditorPanel } from './EditorPanel'
import { SessionTimer } from './SessionTimer'
import { SessionControls } from './SessionControls'
import { ReconnectingOverlay } from './ReconnectingOverlay'
import { AudioOnlyOverlay } from './AudioOnlyOverlay'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SessionPageClientProps {
  session: SessionClientData
  currentUser: SessionClientUser
  iceServers: IceServersConfig[]
  hocuspocusUrl: string
}

// ── User color assignment ──────────────────────────────────────────────────────

const CURSOR_COLORS = ['#4F46E5', '#059669', '#D97706', '#DC2626', '#7C3AED']

function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SessionPageClient({
  session,
  currentUser,
  iceServers,
  hocuspocusUrl,
}: SessionPageClientProps) {
  const router = useRouter()
  const [pageState, setPageState] = useState<SessionPageState>(() => {
    if (session.status === SessionStatus.COMPLETED) return 'ENDED'
    if (session.status === SessionStatus.INTERRUPTED) return 'INTERRUPTED'
    return 'WAITING'
  })
  const [totalExtended, setTotalExtended] = useState(session.extendedBy ?? 0)
  const hasAutoEndedRef = useRef(false)

  const isAdmin = currentUser.role === UserRole.ADMIN
  const userName = currentUser.name ?? (isAdmin ? 'Professor' : 'Aluno')

  // ── Hooks ──────────────────────────────────────────────────────────────────

  const sessionAccess = useSessionAccess({ startAt: session.startAt })

  const webrtc = useWebRTC()

  const timer = useSessionTimer()

  const yjsDoc = useYjsDoc({
    sessionId: session.id,
    isConnected: false, // Updated below when provider connects
    isSynced: false,
  })

  // Token Hocuspocus emitido pelo servidor (T-016): POST /api/v1/sessions/:id/notes/token.
  // Substitui o antigo placeholder (token = currentUser.id). Enquanto o token não chega,
  // o provider fica com token vazio (sem conexão autenticada); ao resolver, o effect do
  // useYjsProvider recria o provider com o token assinado e conecta.
  const [notesToken, setNotesToken] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    apiClient
      .post<{ data: { token: string } | null }>(API.SESSION_NOTES_TOKEN(session.id), {})
      .then((res) => {
        if (!cancelled && res.data?.token) setNotesToken(res.data.token)
      })
      .catch((err) => {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[SessionPageClient] Falha ao obter token do caderno:', err)
        }
      })
    return () => {
      cancelled = true
    }
  }, [session.id])

  const yjsProvider = useYjsProvider({
    sessionId: session.id,
    token: notesToken,
    hocuspocusUrl,
    doc: yjsDoc.doc,
  })

  // Re-derive sync status based on provider state
  const yjsDocWithProvider = useYjsDoc({
    sessionId: session.id,
    isConnected: yjsProvider.isConnected,
    isSynced: yjsProvider.isSynced,
  })

  // ── Reconnect ──────────────────────────────────────────────────────────────

  const handleReconnected = useCallback(() => {
    setPageState('ACTIVE')
    toast.success('Conexão restabelecida!')
  }, [])

  const handleInterrupted = useCallback(() => {
    setPageState('INTERRUPTED')
  }, [])

  const reconnect = useReconnect({
    sessionId: session.id,
    connectionState: webrtc.connectionState,
    restartIce: webrtc.restartIce,
    onReconnected: handleReconnected,
    onInterrupted: handleInterrupted,
  })

  // ── State transitions based on access ──────────────────────────────────────

  useEffect(() => {
    if (pageState !== 'WAITING') return
    if (sessionAccess.canEnterNow) {
      setPageState('READY')
      toast.success('A sala está disponível!')
    }
  }, [sessionAccess.canEnterNow, pageState])

  // ── State transitions based on WebRTC connection ───────────────────────────

  useEffect(() => {
    if (pageState !== 'CONNECTING') return
    if (webrtc.connectionState === 'connected') {
      setPageState('ACTIVE')
      // Start the session timer
      const endAtDate = new Date(
        new Date(session.endAt).getTime() + totalExtended * 60 * 1000,
      )
      timer.start(endAtDate)
    }
  }, [webrtc.connectionState, pageState, session.endAt, totalExtended, timer])

  // ── Audio-only transition ──────────────────────────────────────────────────

  useEffect(() => {
    if (pageState !== 'ACTIVE' && pageState !== 'AUDIO_ONLY') return

    if (webrtc.isRemoteAudioOnly && pageState === 'ACTIVE') {
      setPageState('AUDIO_ONLY')
    } else if (!webrtc.isRemoteAudioOnly && pageState === 'AUDIO_ONLY') {
      setPageState('ACTIVE')
    }
  }, [webrtc.isRemoteAudioOnly, pageState])

  // ── Reconnecting transition ────────────────────────────────────────────────

  useEffect(() => {
    if (
      pageState !== 'ACTIVE' &&
      pageState !== 'AUDIO_ONLY' &&
      pageState !== 'RECONNECTING'
    )
      return

    if (reconnect.isReconnecting && pageState !== 'RECONNECTING') {
      setPageState('RECONNECTING')
    } else if (!reconnect.isReconnecting && pageState === 'RECONNECTING') {
      // Reconnected or interrupted — handled by callbacks
    }
  }, [reconnect.isReconnecting, pageState])

  // ── Auto-encerramento (ST009) ──────────────────────────────────────────────

  useEffect(() => {
    if (!timer.isEnded) return
    if (hasAutoEndedRef.current) return
    if (pageState === 'INTERRUPTED' || pageState === 'ENDED') return

    hasAutoEndedRef.current = true

    // 1. Disconnect WebRTC
    webrtc.disconnect()

    // 2. Destroy Hocuspocus provider
    yjsProvider.destroy()

    // 3. Delay 2s then PATCH COMPLETED
    const timeout = setTimeout(async () => {
      try {
        await apiClient.patch(API.SESSION(session.id), { status: SessionStatus.COMPLETED })
      } catch (err) {
        console.error('[SessionPageClient] Falha ao PATCH COMPLETED:', err)
      }
      setPageState('ENDED')
    }, 2000)

    return () => clearTimeout(timeout)
  }, [timer.isEnded, pageState, webrtc, yjsProvider, session.id])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleEnterRoom = useCallback(async () => {
    setPageState('CONNECTING')
    try {
      await webrtc.connect(session.id, iceServers)
    } catch (err) {
      console.error('[SessionPageClient] Erro ao conectar:', err)
      toast.error('Erro ao conectar. Tente novamente.')
      setPageState('READY')
    }
  }, [webrtc, session.id, iceServers])

  const handleLeave = useCallback(async () => {
    webrtc.disconnect()
    yjsProvider.destroy()

    try {
      await apiClient.patch(API.SESSION(session.id), { status: SessionStatus.COMPLETED })
    } catch (err) {
      console.error('[SessionPageClient] Falha ao PATCH COMPLETED:', err)
      // Retry once
      try {
        await apiClient.patch(API.SESSION(session.id), { status: SessionStatus.COMPLETED })
      } catch {
        toast.error('Erro ao encerrar sessão no servidor.')
      }
    }

    setPageState('ENDED')
  }, [webrtc, yjsProvider, session.id])

  const handleExtend = useCallback(
    async (minutes: number) => {
      try {
        await apiClient.patch(API.SESSION(session.id), { extendedBy: totalExtended + minutes })
        timer.extend(minutes)
        setTotalExtended((prev) => prev + minutes)
        toast.success(`Sessão estendida em ${minutes} minutos.`)
      } catch (err) {
        console.error('[SessionPageClient] Falha ao estender:', err)
        toast.error('Erro ao estender a sessão.')
      }
    },
    [session.id, totalExtended, timer],
  )

  // ── Computed duration for ENDED state ──────────────────────────────────────

  const sessionDurationMinutes = Math.round(
    (new Date(session.endAt).getTime() -
      new Date(session.startAt).getTime() +
      totalExtended * 60 * 1000) /
      60000,
  )

  // ── Render: WAITING ────────────────────────────────────────────────────────

  if (pageState === 'WAITING') {
    return (
      <div data-testid="page-session-waiting" className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 data-testid="session-waiting-header" className="mt-4 text-xl font-semibold text-foreground">
            A sala abre em {sessionAccess.formattedCountdown}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você poderá entrar 5 minutos antes do horário agendado.
          </p>
          <Button
            data-testid="session-waiting-enter-button"
            className="mt-6 w-full"
            disabled
            aria-disabled="true"
          >
            Entrar na sala
          </Button>
        </div>
      </div>
    )
  }

  // ── Render: READY ──────────────────────────────────────────────────────────

  if (pageState === 'READY') {
    return (
      <div data-testid="page-session-ready" className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <Clock className="mx-auto h-12 w-12 text-primary" />
          <h1 data-testid="session-ready-header" className="mt-4 text-xl font-semibold text-foreground">
            A sala está disponível!
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Clique abaixo para entrar na aula.
          </p>
          <Button
            data-testid="session-ready-enter-button"
            className="mt-6 w-full"
            onClick={handleEnterRoom}
          >
            Entrar na sala
          </Button>
        </div>
      </div>
    )
  }

  // ── Render: CONNECTING ─────────────────────────────────────────────────────

  if (pageState === 'CONNECTING') {
    return (
      <div data-testid="page-session-connecting" className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 data-testid="session-connecting-loading" className="h-12 w-12 animate-spin text-primary" />
          <p className="text-lg font-medium text-foreground">
            Conectando...
          </p>
          <p className="text-sm text-muted-foreground">
            Estabelecendo conexão segura
          </p>
        </div>
      </div>
    )
  }

  // ── Render: ENDED ──────────────────────────────────────────────────────────

  if (pageState === 'ENDED') {
    return (
      <div data-testid="page-session-ended" className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h1 data-testid="session-ended-header" className="mt-4 text-2xl font-semibold text-foreground">
            Aula finalizada
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua aula de {sessionDurationMinutes}min foi concluída com sucesso.
          </p>
          <div data-testid="session-ended-actions" className="mt-6 flex flex-col gap-3">
            <Link href={`/session/${session.id}/feedback`}>
              <Button data-testid="session-ended-feedback-button" className="w-full">Avaliar aula</Button>
            </Link>
            <Link href={ROUTES.DASHBOARD}>
              <Button data-testid="session-ended-dashboard-button" variant="outline" className="w-full">
                Voltar ao Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: INTERRUPTED ────────────────────────────────────────────────────

  if (pageState === 'INTERRUPTED') {
    return (
      <div data-testid="page-session-interrupted" className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500" />
          <h1 data-testid="session-interrupted-header" className="mt-4 text-2xl font-semibold text-foreground">
            Sessão interrompida
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua sessão foi interrompida por problemas de conexão. 1 crédito foi
            devolvido à sua conta.
          </p>
          <div data-testid="session-interrupted-actions" className="mt-6 flex flex-col gap-3">
            <Link href={ROUTES.SUPPORT}>
              <Button data-testid="session-interrupted-support-button" className="w-full">Contato</Button>
            </Link>
            <Link href={ROUTES.DASHBOARD}>
              <Button data-testid="session-interrupted-dashboard-button" variant="outline" className="w-full">
                Voltar ao Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: ACTIVE / AUDIO_ONLY / RECONNECTING ────────────────────────────

  const peerInitials = session.student.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div data-testid="page-session" className="flex h-[100dvh] flex-col lg:flex-row bg-background">
      {/* Video panel section */}
      <div data-testid="session-video-section" className="flex flex-col h-[40vh] lg:h-full lg:w-[35%] border-b lg:border-b-0 lg:border-r border-border relative">
        {pageState === 'AUDIO_ONLY' ? (
          <div data-testid="session-audio-only-section" className="flex-1 relative">
            <AudioOnlyOverlay
              peerName={isAdmin ? session.student.name : 'Professor'}
              peerInitials={isAdmin ? peerInitials : 'PR'}
              isAudioActive={!webrtc.isMuted}
            />
          </div>
        ) : (
          <div className="flex-1">
            <VideoPanel
              localStream={webrtc.localStream}
              remoteStream={webrtc.remoteStream}
              connectionState={webrtc.connectionState}
              isAudioOnly={webrtc.isAudioOnly}
              isMuted={webrtc.isMuted}
              isVideoOff={webrtc.isVideoOff}
              localName={userName}
              remoteName={isAdmin ? session.student.name : 'Professor'}
              className="h-full w-full rounded-none"
            />
          </div>
        )}

        <SessionControls
          isMuted={webrtc.isMuted}
          isVideoOff={webrtc.isVideoOff}
          onToggleAudio={webrtc.toggleAudio}
          onToggleVideo={webrtc.toggleVideo}
          onLeave={handleLeave}
        />
      </div>

      {/* Editor section */}
      <div data-testid="session-editor-section" className="flex flex-1 flex-col h-[60vh] lg:h-full lg:w-[65%]">
        <SessionTimer
          formattedTime={timer.formattedTime}
          timerColor={timer.timerColor}
          isCritical={timer.isCritical}
          isAdmin={isAdmin}
          onExtend={handleExtend}
          totalExtended={totalExtended}
        />

        {yjsProvider.provider && (
          <EditorPanel
            doc={yjsDocWithProvider.doc}
            provider={yjsProvider.provider}
            userName={userName}
            userColor={getUserColor(currentUser.id)}
            syncBannerText={yjsDocWithProvider.syncBannerText}
            syncBannerVariant={yjsDocWithProvider.syncBannerVariant}
            connectedUsers={yjsProvider.isConnected ? 2 : 1}
          />
        )}
      </div>

      {/* Reconnecting overlay */}
      {pageState === 'RECONNECTING' && (
        <ReconnectingOverlay
          isVisible
          countdown={reconnect.formattedCountdown}
          attemptCount={reconnect.attemptCount}
          onCancel={reconnect.cancelReconnect}
        />
      )}
    </div>
  )
}
