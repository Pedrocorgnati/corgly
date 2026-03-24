'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SessionControlsProps {
  isMuted: boolean
  isVideoOff: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onLeave: () => void
}

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  variant: 'danger'
}

// ── ConfirmModal ───────────────────────────────────────────────────────────────

function ConfirmModal({
  isOpen,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus trap: focus confirm button on open
  useEffect(() => {
    if (isOpen) {
      confirmRef.current?.focus()
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }

      // Simple focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])',
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={modalRef}
        className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <h2
          id="confirm-modal-title"
          className="text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            size="sm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── SessionControls ────────────────────────────────────────────────────────────

export function SessionControls({
  isMuted,
  isVideoOff,
  onToggleAudio,
  onToggleVideo,
  onLeave,
}: SessionControlsProps) {
  const [showConfirm, setShowConfirm] = useState(false)

  const handleLeaveClick = useCallback(() => {
    setShowConfirm(true)
  }, [])

  const handleConfirm = useCallback(() => {
    setShowConfirm(false)
    onLeave()
  }, [onLeave])

  const handleCancel = useCallback(() => {
    setShowConfirm(false)
  }, [])

  return (
    <>
      <div className="flex items-center justify-center gap-4 bg-card border-t border-border px-4 py-3">
        {/* Mute toggle */}
        <button
          type="button"
          onClick={onToggleAudio}
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
            isMuted
              ? 'bg-destructive hover:bg-destructive/90'
              : 'bg-muted hover:bg-muted/80',
          )}
          aria-label={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}
        >
          {isMuted ? (
            <MicOff className="h-5 w-5 text-white" />
          ) : (
            <Mic className="h-5 w-5 text-foreground" />
          )}
        </button>

        {/* Camera toggle */}
        <button
          type="button"
          onClick={onToggleVideo}
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
            isVideoOff
              ? 'bg-destructive hover:bg-destructive/90'
              : 'bg-muted hover:bg-muted/80',
          )}
          aria-label={isVideoOff ? 'Ligar câmera' : 'Desligar câmera'}
        >
          {isVideoOff ? (
            <VideoOff className="h-5 w-5 text-white" />
          ) : (
            <Video className="h-5 w-5 text-foreground" />
          )}
        </button>

        {/* Leave button */}
        <button
          type="button"
          onClick={handleLeaveClick}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          aria-label="Encerrar aula"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="Encerrar aula?"
        body="Você tem certeza que deseja encerrar a aula?"
        confirmLabel="Encerrar"
        cancelLabel="Cancelar"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        variant="danger"
      />
    </>
  )
}
