'use client'

import { useTranslations } from 'next-intl'
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
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido pelo aluno.
  const t = useTranslations('sessionRoom.timer')

  return (
    <div
      data-testid="session-timer"
      className={cn(
        'flex items-center gap-3 px-4 py-2',
        isCritical && 'animate-pulse',
      )}
    >
      <span
        data-testid="session-timer-value"
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
          data-testid="session-timer-extend-button"
          variant="outline"
          size="sm"
          onClick={() => onExtend(10)}
          disabled={totalExtended >= 60}
          aria-label={t('extendAria')}
        >
          {t('extend')}
        </Button>
      )}
    </div>
  )
}
