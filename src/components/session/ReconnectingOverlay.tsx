'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReconnectingOverlayProps {
  isVisible: boolean
  countdown: string // "01:45" formato MM:SS
  attemptCount: number
  onCancel: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 12

// ── Component ──────────────────────────────────────────────────────────────────

export function ReconnectingOverlay({
  isVisible,
  countdown,
  attemptCount,
  onCancel,
}: ReconnectingOverlayProps) {
  if (!isVisible) return null

  // Parse seconds from countdown for pulse animation
  const [minStr, secStr] = countdown.split(':')
  const totalSeconds = parseInt(minStr ?? '0', 10) * 60 + parseInt(secStr ?? '0', 10)
  const isUrgent = totalSeconds < 30

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* Ícone de reconexão animado */}
      <Loader2
        className="h-12 w-12 animate-spin text-white"
        aria-hidden="true"
      />

      {/* Texto principal */}
      <p className="mt-4 text-lg font-semibold text-white">
        Reconectando...
      </p>

      {/* Countdown */}
      <p
        className={cn(
          'mt-2 font-mono text-lg text-white/80',
          isUrgent && 'animate-pulse text-red-400',
        )}
      >
        Tempo restante: {countdown}
      </p>

      {/* Tentativas */}
      <p className="mt-1 text-sm text-white/60">
        Tentativa {attemptCount} de {MAX_ATTEMPTS}
      </p>

      {/* Botão cancelar */}
      <button
        type="button"
        onClick={onCancel}
        className={cn(
          'mt-6 rounded-lg border border-white/40 px-6 py-2 text-sm font-medium text-white',
          'transition-colors hover:bg-white/10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/60',
        )}
      >
        Cancelar
      </button>
    </div>
  )
}
