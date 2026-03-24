'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseSessionTimerReturn {
  timeRemaining: number
  isWarning: boolean
  isCritical: boolean
  isEnded: boolean
  formattedTime: string
  timerColor: string
  start: (endAt: Date) => void
  extend: (minutes: number) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const mm = Math.floor(clamped / 60)
  const ss = clamped % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function getTimerColor(seconds: number): string {
  if (seconds >= 300) return 'text-green-500'
  if (seconds >= 120) return 'text-yellow-500'
  return 'text-red-500'
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useSessionTimer(): UseSessionTimerReturn {
  const [timeRemaining, setTimeRemaining] = useState(0)
  const endAtRef = useRef<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    if (!endAtRef.current) return
    const remaining = Math.max(0, Math.ceil((endAtRef.current.getTime() - Date.now()) / 1000))
    setTimeRemaining(remaining)
  }, [])

  const start = useCallback(
    (endAt: Date) => {
      clearTimer()
      endAtRef.current = endAt
      // Immediate tick
      const remaining = Math.max(0, Math.ceil((endAt.getTime() - Date.now()) / 1000))
      setTimeRemaining(remaining)

      intervalRef.current = setInterval(tick, 1000)
    },
    [clearTimer, tick],
  )

  const extend = useCallback(
    (minutes: number) => {
      if (!endAtRef.current) return
      endAtRef.current = new Date(endAtRef.current.getTime() + minutes * 60 * 1000)
      // Immediate recalculation
      tick()
    },
    [tick],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer()
    }
  }, [clearTimer])

  const isWarning = timeRemaining > 0 && timeRemaining < 300
  const isCritical = timeRemaining > 0 && timeRemaining < 120
  const isEnded = timeRemaining <= 0 && endAtRef.current !== null

  return {
    timeRemaining,
    isWarning,
    isCritical,
    isEnded,
    formattedTime: formatTime(timeRemaining),
    timerColor: getTimerColor(timeRemaining),
    start,
    extend,
  }
}
