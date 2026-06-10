'use client'

import { Mic, MicOff, Video, LifeBuoy, PhoneOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SessionFallbackControlsProps {
  /**
   * Controle de áudio. Renderiza o botão de mute apenas quando `onToggleAudio`
   * é fornecido (Zero Orfaos: nenhum botão sem handler real).
   */
  isMuted?: boolean
  onToggleAudio?: () => void

  /** Reativar vídeo / voltar ao modo completo. Botão só aparece se fornecido. */
  onRetryVideo?: () => void
  retryLabel?: string

  /** Tentar reconectar agora. Botão só aparece se fornecido. */
  onRetryConnection?: () => void
  retryConnectionLabel?: string

  /** Abrir suporte. Sempre renderizado (ação de escape garantida). */
  onSupport: () => void

  /** Encerrar/interromper a sessão. Sempre renderizado. */
  onInterrupt: () => void
  interruptLabel?: string

  /** Desabilita as ações enquanto uma transição está em andamento. */
  isBusy?: boolean
  className?: string
}

// ── Button helper ───────────────────────────────────────────────────────────

interface FallbackButtonProps {
  onClick: () => void
  icon: React.ReactNode
  label: string
  ariaLabel?: string
  variant: 'neutral' | 'primary' | 'danger'
  disabled?: boolean
}

function FallbackButton({
  onClick,
  icon,
  label,
  ariaLabel,
  variant,
  disabled,
}: FallbackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary',
        variant === 'danger' &&
          'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
        variant === 'neutral' &&
          'border border-border bg-card text-foreground hover:bg-accent focus-visible:ring-ring',
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Controles compartilhados das telas de fallback da sala (ST-47/ST-48):
 * audio-only e reconnecting. Cada botão renderizado tem um handler real
 * (Zero Orfaos) e respeita o estado `isBusy` para dar feedback de ação em
 * andamento (Zero Silencio). Botões opcionais só aparecem quando seu handler
 * é fornecido, evitando ações falsas.
 */
export function SessionFallbackControls({
  isMuted = false,
  onToggleAudio,
  onRetryVideo,
  retryLabel = 'Reativar vídeo',
  onRetryConnection,
  retryConnectionLabel = 'Tentar reconectar agora',
  onSupport,
  onInterrupt,
  interruptLabel = 'Encerrar sessão',
  isBusy = false,
  className,
}: SessionFallbackControlsProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-center justify-center gap-3',
        className,
      )}
      role="group"
      aria-label="Controles da sala em modo de contingência"
    >
      {onToggleAudio && (
        <FallbackButton
          onClick={onToggleAudio}
          disabled={isBusy}
          variant="neutral"
          icon={isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          label={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
          ariaLabel={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
        />
      )}

      {onRetryConnection && (
        <FallbackButton
          onClick={onRetryConnection}
          disabled={isBusy}
          variant="primary"
          icon={<RefreshCw className={cn('h-4 w-4', isBusy && 'animate-spin')} />}
          label={retryConnectionLabel}
        />
      )}

      {onRetryVideo && (
        <FallbackButton
          onClick={onRetryVideo}
          disabled={isBusy}
          variant="primary"
          icon={<Video className="h-4 w-4" />}
          label={retryLabel}
        />
      )}

      <FallbackButton
        onClick={onSupport}
        disabled={isBusy}
        variant="neutral"
        icon={<LifeBuoy className="h-4 w-4" />}
        label="Falar com suporte"
      />

      <FallbackButton
        onClick={onInterrupt}
        disabled={isBusy}
        variant="danger"
        icon={<PhoneOff className="h-4 w-4" />}
        label={interruptLabel}
      />
    </div>
  )
}
