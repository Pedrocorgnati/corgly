import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useReconnect } from '@/hooks/useReconnect'
import type { RTCConnectionState } from '@/hooks/useWebRTC'

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Track interrupt calls via MSW handler spies
let interruptRequests: { url: string; body: unknown }[] = []

beforeEach(() => {
  vi.useFakeTimers()
  interruptRequests = []
  // Default handler: interrupt succeeds, track call
  server.use(
    http.patch('/api/v1/sessions/:sessionId/interrupt', async ({ request }) => {
      const body = await request.json().catch(() => null)
      interruptRequests.push({ url: request.url, body })
      return HttpResponse.json({})
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * O PATCH de interrupt e resolvido pelo MSW fora do relogio falso: esperar por
 * uma quantidade fixa de ticks torna o teste refem da carga da maquina. As
 * esperas abaixo avancam o relogio em passos pequenos ate a condicao valer.
 */
const ESPERA_LONGA = { timeout: 20000, interval: 50 } as const

/** Espelha INTERRUPT_RETRY_DELAY_MS de `src/hooks/useReconnect.ts`. */
const BACKOFF_MS = 2000

/**
 * `vi.useFakeTimers()` troca o setTimeout global, entao o backoff do hook so
 * anda quando o teste move o relogio de proposito. Guardamos aqui, no topo do
 * modulo (antes de qualquer `useFakeTimers`), o setTimeout de verdade: com ele
 * o teste consegue esperar tempo real — o bastante para o MSW responder — sem
 * adiantar um milissegundo do relogio falso.
 */
const setTimeoutReal = globalThis.setTimeout

function tickReal(ms = 10): Promise<void> {
  return new Promise((resolve) => {
    setTimeoutReal(resolve, ms)
  })
}

async function esperaReal(condicao: () => boolean, tentativas = 300): Promise<void> {
  for (let i = 0; i < tentativas; i++) {
    if (condicao()) return
    await tickReal()
  }
  throw new Error('esperaReal: condicao nao satisfeita em tempo real')
}

/**
 * Espiao do `fetch` global. O tipo do retorno e derivado desta funcao (e nao de
 * `typeof vi.spyOn<typeof globalThis, 'fetch'>`) porque instanciar o generico a
 * mao casa com a primeira sobrecarga de `vi.spyOn`, cuja constraint de chave nao
 * aceita `'fetch'`; a resolucao normal de sobrecarga no call site aceita.
 */
function espiarFetch() {
  return vi.spyOn(globalThis, 'fetch')
}

type EspiaoDeFetch = ReturnType<typeof espiarFetch>

/** Chamadas de fetch feitas ao endpoint de interrupt, na ordem de emissao. */
function chamadasDeInterrupt(spy: EspiaoDeFetch) {
  return spy.mock.calls.filter(([input]) => String(input).includes('/interrupt'))
}

function createOptions(overrides = {}) {
  return {
    sessionId: 'session-123',
    connectionState: 'connected' as const,
    restartIce: vi.fn(),
    onReconnected: vi.fn(),
    onInterrupted: vi.fn(),
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useReconnect', () => {
  it('não inicia reconexão quando connectionState é connected', () => {
    const opts = createOptions({ connectionState: 'connected' })
    const { result } = renderHook(() => useReconnect(opts))

    expect(result.current.isReconnecting).toBe(false)
    expect(result.current.reconnectCountdown).toBe(120)
    expect(result.current.formattedCountdown).toBe('02:00')
  })

  it('inicia countdown de 120s quando connectionState muda para disconnected', () => {
    const opts = createOptions({ connectionState: 'disconnected' })
    const { result } = renderHook(() => useReconnect(opts))

    expect(result.current.isReconnecting).toBe(true)
    expect(result.current.reconnectCountdown).toBe(120)
  })

  it('inicia countdown quando connectionState muda para failed', () => {
    const opts = createOptions({ connectionState: 'failed' })
    const { result } = renderHook(() => useReconnect(opts))

    expect(result.current.isReconnecting).toBe(true)
  })

  it('decrementa countdown a cada segundo', () => {
    const opts = createOptions({ connectionState: 'disconnected' })
    const { result } = renderHook(() => useReconnect(opts))

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.reconnectCountdown).toBe(115)
    expect(result.current.formattedCountdown).toBe('01:55')
  })

  it('chama restartIce a cada 10s', () => {
    const restartIce = vi.fn()
    const opts = createOptions({ connectionState: 'disconnected', restartIce })
    renderHook(() => useReconnect(opts))

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(restartIce).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(restartIce).toHaveBeenCalledTimes(2)
  })

  it('incrementa attemptCount a cada ICE restart', () => {
    const opts = createOptions({ connectionState: 'disconnected' })
    const { result } = renderHook(() => useReconnect(opts))

    act(() => {
      vi.advanceTimersByTime(30000) // 3 ICE restarts
    })

    expect(result.current.attemptCount).toBe(3)
  })

  it('reconexão bem-sucedida: para countdown e chama onReconnected', () => {
    const onReconnected = vi.fn()
    const opts = createOptions({
      connectionState: 'disconnected',
      onReconnected,
    })
    const { result, rerender } = renderHook(
      ({ connectionState }) =>
        useReconnect({ ...opts, connectionState }),
      { initialProps: { connectionState: 'disconnected' as RTCConnectionState } },
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.isReconnecting).toBe(true)

    // Simulate reconnection
    rerender({ connectionState: 'connected' })

    expect(result.current.isReconnecting).toBe(false)
    expect(onReconnected).toHaveBeenCalledTimes(1)
  })

  it('countdown=0 → PATCH interrupt chamado e onInterrupted executado', async () => {
    const onInterrupted = vi.fn()
    const opts = createOptions({
      connectionState: 'disconnected',
      onInterrupted,
    })
    renderHook(() => useReconnect(opts))

    // Advance to countdown = 0
    act(() => {
      vi.advanceTimersByTime(120000)
    })

    // Allow async PATCH to resolve
    await vi.waitFor(() => {
      expect(interruptRequests.length).toBeGreaterThan(0)
      expect(onInterrupted).toHaveBeenCalled()
    }, ESPERA_LONGA)

    expect(interruptRequests[0].url).toContain('session-123/interrupt')
    // O desfecho viaja junto: a tela so pode afirmar que o credito voltou
    // quando o servidor confirmou.
    expect(onInterrupted).toHaveBeenCalledWith('confirmed')
  })

  it('PATCH interrupt falhando nas duas tentativas → onInterrupted recebe unconfirmed', async () => {
    const onInterrupted = vi.fn()
    let callCount = 0
    server.use(
      http.patch('/api/v1/sessions/:sessionId/interrupt', () => {
        callCount++
        return HttpResponse.error()
      }),
    )

    const opts = createOptions({
      connectionState: 'disconnected',
      onInterrupted,
    })
    renderHook(() => useReconnect(opts))

    act(() => {
      vi.advanceTimersByTime(120000)
    })

    // Primeira tentativa falha e o hook entra no backoff.
    await esperaReal(() => callCount >= 1)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS)

    await vi.waitFor(() => {
      expect(callCount).toBe(2)
      expect(onInterrupted).toHaveBeenCalled()
    }, ESPERA_LONGA)

    // Zero Silencio: a falha persistente nao pode chegar a UI como sucesso.
    expect(onInterrupted).toHaveBeenCalledWith('unconfirmed')
  })

  it('cancelReconnect → interrupção imediata', async () => {
    const onInterrupted = vi.fn()
    const opts = createOptions({
      connectionState: 'disconnected',
      onInterrupted,
    })
    const { result } = renderHook(() => useReconnect(opts))

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.isReconnecting).toBe(true)

    act(() => {
      result.current.cancelReconnect()
    })

    await vi.waitFor(() => {
      expect(interruptRequests.length).toBeGreaterThan(0)
      expect(onInterrupted).toHaveBeenCalled()
    }, ESPERA_LONGA)

    expect(result.current.isReconnecting).toBe(false)
    expect(interruptRequests[0].url).toContain('session-123/interrupt')
    expect(onInterrupted).toHaveBeenCalledWith('confirmed')
  })

  it('formattedCountdown exibe formato MM:SS correto', () => {
    const opts = createOptions({ connectionState: 'disconnected' })
    const { result } = renderHook(() => useReconnect(opts))

    expect(result.current.formattedCountdown).toBe('02:00')

    act(() => {
      vi.advanceTimersByTime(65000) // 65 seconds
    })

    expect(result.current.formattedCountdown).toBe('00:55')
  })

  /**
   * DEFESA: o PATCH de interrupt e o que devolve o credito da aula ao aluno.
   * Passar um AbortSignal aqui (era `AbortSignal.timeout(10_000)`) cancela
   * exatamente essa chamada numa rede que acabou de cair — o aluno ve a aula
   * interrompida e fica sem o credito. O prazo de espera existe, mas e cobrado
   * com timer proprio, sem cancelar a requisicao.
   */
  it('nao aborta o PATCH que devolve o credito do aluno', async () => {
    const fetchSpy = espiarFetch()
    const opts = createOptions({ connectionState: 'disconnected' })
    renderHook(() => useReconnect(opts))

    act(() => {
      vi.advanceTimersByTime(120000)
    })
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled()
    }, ESPERA_LONGA)

    const call = fetchSpy.mock.calls.find(([input]) =>
      String(input).includes('/interrupt'),
    )
    expect(call).toBeDefined()
    expect(call?.[1]?.signal).toBeUndefined()
  })

  /**
   * DEFESA: reenviar na mesma hora e reenviar para a mesma rede caida. O retry
   * so vale alguma coisa depois de um respiro.
   */
  it('espera antes de repetir o PATCH em vez de reenviar na hora', async () => {
    const fetchSpy = espiarFetch()
    let callCount = 0
    server.use(
      http.patch('/api/v1/sessions/:sessionId/interrupt', async () => {
        callCount++
        if (callCount === 1) return HttpResponse.error()
        return HttpResponse.json({})
      }),
    )

    const opts = createOptions({ connectionState: 'disconnected' })
    renderHook(() => useReconnect(opts))

    act(() => {
      vi.advanceTimersByTime(120000)
    })

    // Janela de tempo REAL: o MSW responde e o hook cai no catch, mas o relogio
    // falso nao anda, entao o backoff nao pode ter disparado. Sem backoff, o
    // retry sairia dentro desta janela e a segunda chamada apareceria aqui.
    await esperaReal(() => callCount >= 1)
    await tickReal(200)
    expect(chamadasDeInterrupt(fetchSpy)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(BACKOFF_MS)
    await vi.waitFor(() => {
      expect(callCount).toBe(2)
    }, ESPERA_LONGA)
  })

  it('PATCH interrupt com retry em caso de falha na primeira tentativa', async () => {
    const onInterrupted = vi.fn()
    let callCount = 0
    // First call fails, second succeeds
    server.use(
      http.patch('/api/v1/sessions/:sessionId/interrupt', async ({ request }) => {
        callCount++
        if (callCount === 1) return HttpResponse.error()
        interruptRequests.push({ url: request.url, body: null })
        return HttpResponse.json({})
      }),
    )

    const opts = createOptions({
      connectionState: 'disconnected',
      onInterrupted,
    })
    renderHook(() => useReconnect(opts))

    act(() => {
      vi.advanceTimersByTime(120000)
    })

    await vi.advanceTimersByTimeAsync(BACKOFF_MS)

    // Should have retried (callCount reached 2)
    await vi.waitFor(() => {
      expect(callCount).toBe(2)
      expect(onInterrupted).toHaveBeenCalled()
    }, ESPERA_LONGA)

    // Retry que deu certo e sucesso: a tela pode afirmar o estorno.
    expect(onInterrupted).toHaveBeenCalledWith('confirmed')
  })
})
