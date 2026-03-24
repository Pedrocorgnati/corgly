'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SessionTimerProps {
  formattedTime: string
  timerColor: string
  isCritical: boolean
  isAdmin: boolean
  onExtend: (minutes: number) => void
  totalExtended?: number
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SessionTimer({
  formattedTime,
  timerColor,
  isCritical,
  isAdmin,
  onExtend,
  totalExtended = 0,
}: SessionTimerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2',
        isCritical && 'animate-pulse',
      )}
    >
      <span
        role="timer"
        aria-live="polite"
        className={cn(
          'font-mono text-2xl lg:text-4xl font-bold tabular-nums',
          timerColor,
        )}
      >
        {formattedTime}
      </span>

      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onExtend(10)}
          disabled={totalExtended >= 60}
          aria-label="Estender sessão em 10 minutos"
        >
          Estender +10min
        </Button>
      )}
    </div>
  )
}
