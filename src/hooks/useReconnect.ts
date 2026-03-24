'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RTCConnectionState } from './useWebRTC'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseReconnectOptions {
  sessionId: string
  connectionState: RTCConnectionState
  restartIce: () => void
  onReconnected: () => void
  onInterrupted: () => void
}

export interface UseReconnectReturn {
  isReconnecting: boolean
  reconnectCountdown: number
  formattedCountdown: string
  cancelReconnect: () => void
  attemptCount: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const RECONNECT_TIMEOUT_S = 120
const ICE_RESTART_INTERVAL_S = 10

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

async function patchInterrupt(sessionId: string, reason: string): Promise<void> {
  const attempt = async () => {
    const res = await fetch(`/api/v1/sessions/${sessionId}/interrupt`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Interrupt PATCH falhou: ${res.status}`)
  }

  try {
    await attempt()
  } catch (err) {
    console.warn('[useReconnect] Falha ao enviar interrupt, tentando novamente...', err)
    try {
      await attempt()
    } catch (retryErr) {
      console.error('[useReconnect] Falha persistente ao enviar interrupt:', retryErr)
    }
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useReconnect({
  sessionId,
  connectionState,
  restartIce,
  onReconnected,
  onInterrupted,
}: UseReconnectOptions): UseReconnectReturn {
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [countdown, setCountdown] = useState(RECONNECT_TIMEOUT_S)
  const [attemptCount, setAttemptCount] = useState(0)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iceRestartRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isReconnectingRef = useRef(false)
  const sessionIdRef = useRef(sessionId)

  // Keep sessionId ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const cleanup = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    if (iceRestartRef.current) {
      clearInterval(iceRestartRef.current)
      iceRestartRef.current = null
    }
  }, [])

  const stopReconnecting = useCallback(() => {
    cleanup()
    setIsReconnecting(false)
    isReconnectingRef.current = false
    setCountdown(RECONNECT_TIMEOUT_S)
    setAttemptCount(0)
  }, [cleanup])

  const startReconnecting = useCallback(() => {
    if (isReconnectingRef.current) return

    isReconnectingRef.current = true
    setIsReconnecting(true)
    setCountdown(RECONNECT_TIMEOUT_S)
    setAttemptCount(0)

    // Countdown timer: tick every 1s
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Time's up - interrupt
          cleanup()
          patchInterrupt(sessionIdRef.current, 'connection_lost').finally(() => {
            onInterrupted()
          })
          setIsReconnecting(false)
          isReconnectingRef.current = false
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // ICE restart every 10s
    iceRestartRef.current = setInterval(() => {
      setAttemptCount((prev) => prev + 1)
      restartIce()
    }, ICE_RESTART_INTERVAL_S * 1000)
  }, [cleanup, restartIce, onInterrupted])

  const cancelReconnect = useCallback(() => {
    cleanup()
    setIsReconnecting(false)
    isReconnectingRef.current = false
    setCountdown(RECONNECT_TIMEOUT_S)
    setAttemptCount(0)
    patchInterrupt(sessionIdRef.current, 'connection_lost').finally(() => {
      onInterrupted()
    })
  }, [cleanup, onInterrupted])

  // Monitor connectionState changes
  useEffect(() => {
    if (connectionState === 'disconnected' || connectionState === 'failed') {
      startReconnecting()
    } else if (connectionState === 'connected' && isReconnectingRef.current) {
      stopReconnecting()
      onReconnected()
    }
  }, [connectionState, startReconnecting, stopReconnecting, onReconnected])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    isReconnecting,
    reconnectCountdown: countdown,
    formattedCountdown: formatCountdown(countdown),
    cancelReconnect,
    attemptCount,
  }
}
