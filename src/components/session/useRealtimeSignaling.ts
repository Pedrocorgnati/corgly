'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { timeoutSignal } from '@/lib/timeout-signal'
import type { SessionSignal } from '@/types/sala-virtual'
import type {
  RealtimeTransportKind,
  TransportDescriptor,
} from '@/lib/sessions/realtime-signaling.service'

/**
 * Hook de realtime signaling — cliente da Fase 1 do ADR-0002.
 *
 * Implementa o lado-cliente da interface `SignalingTransport`: negocia o
 * transporte com `GET /api/v1/realtime/sessions/:id`, usa WebSocket quando a flag
 * `NEXT_PUBLIC_REALTIME_WS_ENABLED` está ligada, e degrada automaticamente para
 * HTTP poll (o caminho existente, mantido como fallback) após
 * `fallbackAfterFailures` falhas de handshake — espelhando a estratégia
 * STUN->TURN do ADR-0001.
 *
 * `connectionQuality`:
 *   - `'ws'`   → verde  (transporte WebSocket primário ativo)
 *   - `'poll'` → amarelo (operando em poll-fallback)
 * reaproveitando a semântica do `ConnectionIndicator` (seção "Fallback" do ADR).
 *
 * Fase 1: com a flag off, este hook opera 100% em poll. O caminho WS fica
 * stubado atrás da flag (tenta upgrade, degrada para poll na falha) e será
 * efetivado na Fase 2.
 */

const POLL_INTERVAL_MS = 2_000
// Nao ha constante de retry de negociacao: `negotiate` que falha degrada para
// poll na hora (ver `connect`). A antiga `NEGOTIATE_RETRY_MS` nunca teve
// consumidor — era placeholder de um retry que a Fase 1 decidiu nao ter.

export interface UseRealtimeSignalingReturn {
  /** Transporte efetivamente em uso após negociação/fallback. */
  connectionQuality: RealtimeTransportKind
  connected: boolean
  connect: (sessionId: string) => Promise<void>
  send: (message: Omit<SessionSignal, 'from'>) => Promise<void>
  /** Registra um handler para mensagens recebidas; retorna unsubscribe. */
  subscribe: (handler: (message: SessionSignal) => void) => () => void
  disconnect: () => void
}

function wsEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_REALTIME_WS_ENABLED === 'true'
}

export function useRealtimeSignaling(): UseRealtimeSignalingReturn {
  const [connectionQuality, setConnectionQuality] = useState<RealtimeTransportKind>('poll')
  const [connected, setConnected] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSeenRef = useRef<string | undefined>(undefined)
  const handlersRef = useRef<Set<(message: SessionSignal) => void>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)

  const emit = useCallback((message: SessionSignal) => {
    handlersRef.current.forEach((h) => {
      try {
        h(message)
      } catch (err) {
        console.error('[useRealtimeSignaling] handler falhou:', err)
      }
    })
  }, [])

  const stopPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const pollOnce = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    try {
      const qs = lastSeenRef.current ? `?after=${encodeURIComponent(lastSeenRef.current)}` : ''
      const res = await fetch(`/api/v1/realtime/sessions/${sessionId}${qs}`, {
        signal: timeoutSignal(10_000),
      })
      if (!res.ok) return
      const json = await res.json()
      const messages: SessionSignal[] = json?.data?.messages ?? []
      for (const msg of messages) {
        lastSeenRef.current = msg.timestamp
        emit(msg)
      }
    } catch (err) {
      console.warn('[useRealtimeSignaling] poll falhou, retry no próximo intervalo:', err)
    }
  }, [emit])

  const startPoll = useCallback(() => {
    stopPoll()
    setConnectionQuality('poll')
    pollTimerRef.current = setInterval(() => {
      void pollOnce()
    }, POLL_INTERVAL_MS)
    // primeira leitura imediata
    void pollOnce()
  }, [pollOnce, stopPoll])

  const negotiate = useCallback(async (sessionId: string): Promise<TransportDescriptor | null> => {
    try {
      const res = await fetch(`/api/v1/realtime/sessions/${sessionId}`, {
        signal: timeoutSignal(10_000),
      })
      if (!res.ok) return null
      const json = await res.json()
      return (json?.data?.descriptor as TransportDescriptor) ?? null
    } catch {
      return null
    }
  }, [])

  const connect = useCallback(
    async (sessionId: string) => {
      sessionIdRef.current = sessionId
      lastSeenRef.current = undefined

      const descriptor = await negotiate(sessionId)

      // Fase 1: WS só é tentado se a flag de cliente E a negociação concordarem.
      // Qualquer falha degrada para poll (fallback mantido).
      if (wsEnabledClient() && descriptor?.transport === 'ws' && descriptor.wsUrl) {
        try {
          const ws = new WebSocket(descriptor.wsUrl)
          wsRef.current = ws
          ws.onmessage = (ev) => {
            try {
              emit(JSON.parse(ev.data) as SessionSignal)
            } catch {
              /* ignora frames malformados */
            }
          }
          ws.onopen = () => {
            setConnectionQuality('ws')
            setConnected(true)
          }
          ws.onclose = () => {
            // Degrada para poll preservando a sessão (ADR: fallback automático).
            wsRef.current = null
            startPoll()
            setConnected(true)
          }
          ws.onerror = () => {
            try {
              ws.close()
            } catch {
              /* noop */
            }
          }
          return
        } catch (err) {
          console.warn('[useRealtimeSignaling] upgrade WS falhou, usando poll-fallback:', err)
        }
      }

      // Default Fase 1: poll.
      startPoll()
      setConnected(true)
    },
    [negotiate, startPoll, emit],
  )

  const send = useCallback(async (message: Omit<SessionSignal, 'from'>) => {
    const sessionId = sessionIdRef.current
    if (!sessionId) throw new Error('useRealtimeSignaling: connect() antes de send().')

    // WS aberto → envia pelo socket; senão publica via endpoint (poll backbone).
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      return
    }

    const res = await fetch(`/api/v1/realtime/sessions/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: timeoutSignal(10_000),
    })
    if (!res.ok) throw new Error(`Realtime send falhou: ${res.status}`)
  }, [])

  const subscribe = useCallback((handler: (message: SessionSignal) => void) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  const disconnect = useCallback(() => {
    stopPoll()
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {
        /* noop */
      }
      wsRef.current = null
    }
    sessionIdRef.current = null
    setConnected(false)
  }, [stopPoll])

  // Cleanup no unmount.
  useEffect(() => {
    return () => {
      stopPoll()
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {
          /* noop */
        }
      }
    }
  }, [stopPoll])

  return { connectionQuality, connected, connect, send, subscribe, disconnect }
}
