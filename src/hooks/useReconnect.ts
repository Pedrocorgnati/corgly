'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RTCConnectionState } from './useWebRTC'

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * O que aconteceu com o PATCH de interrupt quando a aula foi encerrada por
 * queda de conexao.
 *
 * - `confirmed`: o servidor respondeu OK. A sessao esta INTERRUPTED e o credito
 *   ja voltou para o aluno.
 * - `unconfirmed`: as duas tentativas falharam (rede fora, timeout, 5xx). A
 *   aula acabou do mesmo jeito na tela, mas NINGUEM SABE se o servidor soube.
 *   Ate esta rodada esse caso era engolido num `console.error` e a UI dizia ao
 *   aluno que o credito tinha voltado — afirmacao que o cliente nao tem como
 *   sustentar. Quem recebe este valor DEVE dizer ao usuario que o aviso nao foi
 *   confirmado.
 */
export type InterruptOutcome = 'confirmed' | 'unconfirmed'

export interface UseReconnectOptions {
  sessionId: string
  connectionState: RTCConnectionState
  restartIce: () => void
  onReconnected: () => void
  /** Recebe o desfecho do PATCH: nunca e chamado sem dizer se o aviso chegou. */
  onInterrupted: (outcome: InterruptOutcome) => void
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
/** Quanto esperamos por tentativa antes de liberar a UI (sem cancelar o envio). */
const INTERRUPT_ATTEMPT_TIMEOUT_MS = 10_000
/** Respiro entre a primeira tentativa e o retry: a rede acabou de cair. */
const INTERRUPT_RETRY_DELAY_MS = 2_000

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Espera `promise` por no maximo `ms` e devolve o controle ao chamador quando o
 * prazo estoura — SEM cancelar a requisicao, que segue em voo e ainda pode
 * chegar ao servidor.
 *
 * Aqui isso e regra de produto, nao detalhe: o PATCH de interrupt e o que
 * devolve o credito da aula ao aluno (`sessionService.interruptSession`, que e
 * idempotente para sessao ja INTERRUPTED). O `AbortSignal.timeout` que existia
 * neste lugar cancelava exatamente essa chamada aos 10s numa rede que acabou de
 * cair: o aluno via a aula interrompida e ficava sem o credito de volta.
 * O prazo continua existindo para que a UI nunca fique presa esperando a rede.
 */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Interrupt PATCH sem resposta em ${ms}ms`)),
      ms,
    )
    // Os dois handlers ficam anexados a promise original: se ela rejeitar depois
    // do prazo, a rejeicao ja esta tratada (nao vira unhandled rejection).
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}

/**
 * Envia o PATCH de interrupt (uma tentativa + um retry) e devolve o DESFECHO.
 *
 * Nao lanca: o chamador esta numa transicao de tela e precisa seguir de
 * qualquer forma. Mas tambem nao mente — `unconfirmed` obriga a UI a admitir
 * que o servidor pode nao ter sido avisado.
 */
async function patchInterrupt(sessionId: string, reason: string): Promise<InterruptOutcome> {
  const attempt = async () => {
    const res = await withDeadline(
      fetch(`/api/v1/sessions/${sessionId}/interrupt`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }),
      INTERRUPT_ATTEMPT_TIMEOUT_MS,
    )
    if (!res.ok) throw new Error(`Interrupt PATCH falhou: ${res.status}`)
  }

  try {
    await attempt()
    return 'confirmed'
  } catch (err) {
    console.warn('[useReconnect] Falha ao enviar interrupt, tentando novamente...', err)
    // Reenviar na mesma hora e reenviar para a mesma rede caida. O respiro custa
    // 2s de uma tela que ja esta em transicao e e o que da chance ao retry.
    await delay(INTERRUPT_RETRY_DELAY_MS)
    try {
      await attempt()
      return 'confirmed'
    } catch (retryErr) {
      console.error('[useReconnect] Falha persistente ao enviar interrupt:', retryErr)
      return 'unconfirmed'
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

  const sessionIdRef = useRef(sessionId)
  const restartIceRef = useRef(restartIce)
  const onInterruptedRef = useRef(onInterrupted)
  const wasReconnectingRef = useRef(false)

  // Callbacks e id ficam em ref para que o efeito dos timers dependa APENAS de
  // `isReconnecting`. Se ele dependesse das funcoes do chamador, um pai que
  // recriasse `restartIce` a cada render remontaria os intervalos e o countdown
  // recomecaria do 120 para sempre — a aula nunca seria interrompida.
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    restartIceRef.current = restartIce
  }, [restartIce])

  useEffect(() => {
    onInterruptedRef.current = onInterrupted
  }, [onInterrupted])

  /**
   * Avisa o servidor e reporta o desfecho ao chamador. Usado nos dois caminhos
   * de encerramento (countdown zerado e cancelamento manual).
   */
  const reportInterrupt = useCallback(() => {
    patchInterrupt(sessionIdRef.current, 'connection_lost').then(
      (outcome) => onInterruptedRef.current(outcome),
      // `patchInterrupt` ja trata as falhas do PATCH; este segundo ramo cobre um
      // erro do proprio helper e nao pode virar silencio.
      () => onInterruptedRef.current('unconfirmed'),
    )
  }, [])

  // ── Transicao de episodio (ajuste de estado durante o render) ──────────────
  //
  // `connectionState` e uma prop: reagir a ela dentro de um `useEffect` que
  // chama `setState` provoca render em cascata (e e o que a regra
  // `react-hooks/set-state-in-effect` acusa). O padrao suportado pelo React
  // para "ajustar estado quando uma prop muda" e comparar com o valor anterior
  // durante o render — o React reexecuta o componente na hora, sem commit
  // intermediario. Aqui isso e so troca de estado: os timers e o PATCH
  // continuam em efeito/callback, porque render tem de ser puro.
  const [seenConnectionState, setSeenConnectionState] = useState<RTCConnectionState | null>(null)

  if (connectionState !== seenConnectionState) {
    setSeenConnectionState(connectionState)
    const lost = connectionState === 'disconnected' || connectionState === 'failed'
    if (lost && !isReconnecting) {
      setIsReconnecting(true)
      setCountdown(RECONNECT_TIMEOUT_S)
      setAttemptCount(0)
    } else if (connectionState === 'connected' && isReconnecting) {
      setIsReconnecting(false)
      setCountdown(RECONNECT_TIMEOUT_S)
      setAttemptCount(0)
    }
  }

  // ── Timers do episodio ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isReconnecting) return

    // Contador local do episodio: o valor autoritativo para decidir o fim do
    // prazo vive aqui, no fechamento do efeito, e nao dentro do updater de
    // `setCountdown` — updater tem de ser puro, e disparar PATCH la dentro
    // executaria a chamada duas vezes em StrictMode.
    let remaining = RECONNECT_TIMEOUT_S

    const countdownTimer = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(countdownTimer)
        clearInterval(iceRestartTimer)
        setCountdown(0)
        setIsReconnecting(false)
        reportInterrupt()
        return
      }
      setCountdown(remaining)
    }, 1000)

    const iceRestartTimer = setInterval(() => {
      setAttemptCount((prev) => prev + 1)
      restartIceRef.current()
    }, ICE_RESTART_INTERVAL_S * 1000)

    return () => {
      clearInterval(countdownTimer)
      clearInterval(iceRestartTimer)
    }
  }, [isReconnecting, reportInterrupt])

  // ── Notificacao de reconexao bem-sucedida ──────────────────────────────────
  //
  // So observa a transicao (nao escreve estado): o episodio acabou com a
  // conexao de volta, entao o chamador precisa saber que a aula continua.
  useEffect(() => {
    const wasReconnecting = wasReconnectingRef.current
    wasReconnectingRef.current = isReconnecting
    if (wasReconnecting && !isReconnecting && connectionState === 'connected') {
      onReconnected()
    }
  }, [isReconnecting, connectionState, onReconnected])

  const cancelReconnect = useCallback(() => {
    setIsReconnecting(false)
    setCountdown(RECONNECT_TIMEOUT_S)
    setAttemptCount(0)
    reportInterrupt()
  }, [reportInterrupt])

  return {
    isReconnecting,
    reconnectCountdown: countdown,
    formattedCountdown: formatCountdown(countdown),
    cancelReconnect,
    attemptCount,
  }
}
