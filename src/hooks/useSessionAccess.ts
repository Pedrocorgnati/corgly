'use client'

import { useEffect, useState } from 'react'
import { canEnter, secondsUntilEntry } from '@/lib/session/canEnter'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Session {
  startAt: Date | string
}

export interface UseSessionAccessReturn {
  canEnterNow: boolean
  countdown: number          // segundos até abertura (0 se já aberta)
  formattedCountdown: string // "MM:SS"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const mm = Math.floor(clamped / 60)
  const ss = clamped % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSessionAccess(session: Session): UseSessionAccessReturn {
  const [canEnterNow, setCanEnterNow] = useState(() => canEnter(session, new Date()))
  const [countdown, setCountdown] = useState(() =>
    Math.max(0, secondsUntilEntry(session, new Date())),
  )

  useEffect(() => {
    // Tick imediato para sincronizar estado inicial sem aguardar 1s
    const tick = () => {
      const now = new Date()
      const enters = canEnter(session, now)
      const secs = Math.max(0, secondsUntilEntry(session, now))
      setCanEnterNow(enters)
      setCountdown(secs)
    }

    tick()

    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
    // session.startAt é estável após o mount — incluímos para corretude
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.startAt])

  return {
    canEnterNow,
    countdown,
    formattedCountdown: formatCountdown(countdown),
  }
}
