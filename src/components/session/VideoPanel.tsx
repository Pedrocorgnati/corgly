'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, MicOff, RefreshCw, Video, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectionIndicator } from './ConnectionIndicator'
import type { RTCConnectionState } from '@/hooks/useWebRTC'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VideoPanelProps {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  connectionState: RTCConnectionState
  isAudioOnly: boolean
  isMuted: boolean
  isVideoOff: boolean
  localName?: string
  remoteName?: string
  rtt?: number
  packetLoss?: number
  onRetry?: () => void
  className?: string
}

// ── AudioOnlyOverlay ──────────────────────────────────────────────────────────

function AudioOnlyOverlay({ name }: { name?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-700">
        <Volume2 className="h-8 w-8 text-gray-400" aria-hidden="true" />
      </div>
      {name && (
        <p className="mt-3 text-sm font-medium text-gray-300">{name}</p>
      )}
      <p className="mt-1 text-xs text-gray-500">Apenas áudio</p>
    </div>
  )
}

// ── VideoPlaceholder ──────────────────────────────────────────────────────────

function VideoPlaceholder({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-700">
      <Video className="h-8 w-8 text-gray-500" aria-hidden="true" />
      <p className="mt-2 text-xs text-gray-500">{label}</p>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VideoPanel({
  localStream,
  remoteStream,
  connectionState,
  isAudioOnly,
  isMuted,
  isVideoOff,
  localName = 'Você',
  remoteName = 'Professor',
  rtt,
  packetLoss,
  onRetry,
  className,
}: VideoPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const [remoteVideoActive, setRemoteVideoActive] = useState(false)

  // Atribuir srcObject quando os streams mudam
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
      setRemoteVideoActive(!!remoteStream)
    }
  }, [remoteStream])

  const handleRemoteVideoPlay = useCallback(() => {
    setRemoteVideoActive(true)
  }, [])

  // ── Estado: connecting ───────────────────────────────────────────────────────

  if (connectionState === 'connecting' || connectionState === 'new') {
    return (
      <div
        className={cn(
          'relative flex aspect-video w-full items-center justify-center rounded-xl bg-gray-900',
          className,
        )}
        aria-label="Painel de vídeo: conectando"
      >
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 className="h-10 w-10 animate-spin" aria-hidden="true" />
          <p className="text-sm font-medium">Conectando...</p>
          <p className="text-xs text-gray-500">Estabelecendo conexão segura</p>
        </div>
      </div>
    )
  }

  // ── Estado: failed ───────────────────────────────────────────────────────────

  if (connectionState === 'failed') {
    return (
      <div
        className={cn(
          'relative flex aspect-video w-full items-center justify-center rounded-xl bg-gray-900',
          className,
        )}
        aria-label="Painel de vídeo: falha na conexão"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-red-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-gray-50">Falha na conexão</p>
            <p className="mt-1 text-xs text-gray-400">
              Não foi possível estabelecer a conexão de vídeo.
            </p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className={cn(
                'flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
                'hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
              aria-label="Tentar reconectar"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Estado: disconnected ─────────────────────────────────────────────────────

  if (connectionState === 'disconnected') {
    return (
      <div
        className={cn(
          'relative flex aspect-video w-full items-center justify-center rounded-xl bg-gray-900',
          className,
        )}
        aria-label="Painel de vídeo: desconectado"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-yellow-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-gray-50">Conexão interrompida</p>
            <p className="mt-1 text-xs text-gray-400">Aguardando reconexão automática...</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className={cn(
                'flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground',
                'hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-label="Reconectar manualmente"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reconectar
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Estado: connected ────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl bg-gray-900',
        // Mobile: altura fixa 40vh. Desktop: flex adaptável
        'h-[40vh] md:aspect-video md:h-auto',
        className,
      )}
      aria-label="Painel de vídeo da sessão"
    >
      {/* ── Tile principal: vídeo remoto (80% da área) ────────────────────────── */}
      <div className="absolute inset-0">
        {isAudioOnly ? (
          <AudioOnlyOverlay name={remoteName} />
        ) : (
          <>
            {/* Placeholder quando stream remoto ainda não chegou */}
            {!remoteVideoActive && (
              <VideoPlaceholder label="Aguardando vídeo do professor..." />
            )}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              onPlay={handleRemoteVideoPlay}
              className={cn(
                'h-full w-full object-cover',
                !remoteVideoActive && 'invisible',
              )}
              aria-label={`Vídeo de ${remoteName}`}
            />
          </>
        )}
      </div>

      {/* ── ConnectionIndicator (canto superior direito) ─────────────────────── */}
      <div className="absolute right-3 top-3 z-10">
        <ConnectionIndicator
          connectionState={connectionState}
          rtt={rtt}
          packetLoss={packetLoss}
        />
      </div>

      {/* ── Nome do peer remoto (canto inferior esquerdo do tile principal) ────── */}
      <div className="absolute bottom-3 left-3 z-10">
        <div className="flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 backdrop-blur-sm">
          <span className="text-xs font-medium text-white">{remoteName}</span>
        </div>
      </div>

      {/* ── Self-view: local video (PiP — canto inferior direito, 20%) ──────────
           Desktop: posição absoluta no tile principal
           Mobile: parte do layout, menor        */}
      <div
        className={cn(
          'absolute bottom-3 right-3 z-10',
          'w-[20%] min-w-[80px] max-w-[140px]',
          'overflow-hidden rounded-lg border-2 border-gray-700 bg-gray-700',
          // Aspect-ratio para self-view
          'aspect-video',
        )}
        aria-label="Seu vídeo (self-view)"
      >
        {isVideoOff || !localStream ? (
          <VideoPlaceholder label="" />
        ) : (
          <video
            ref={localVideoRef}
            autoPlay
            muted // OBRIGATÓRIO: evitar eco
            playsInline
            className="h-full w-full object-cover"
            aria-label="Seu próprio vídeo"
          />
        )}

        {/* Overlay com nome e status de mudo */}
        <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/50 px-1 py-0.5">
          <span className="text-[10px] font-medium text-white">{localName}</span>
          {isMuted && (
            <MicOff className="h-2.5 w-2.5 text-red-400" aria-label="Microfone desligado" />
          )}
        </div>
      </div>

      {/* ── Indicador de mudo do peer remoto ────────────────────────────────────
           Exibido como ícone overlay no tile remoto quando peer está mudo.
           Controlado externamente via prop futura; não há estado de mudo do peer
           nesta versão (ST005 lida apenas com sinais de mídia, não de controle).
           Placeholder para extensão futura. */}
    </div>
  )
}
