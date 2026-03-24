import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { useReconnect } from '@/hooks/useReconnect'

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Track interrupt calls via MSW handler spies
let interruptRequests: { url: string; body: unknown }[] = []

beforeEach(() => {
  vi.useFakeTimers()
  interruptRequests = []
  // Default handler: interrupt succeeds, track call
  server.use(
    http.patch('/api/v1/sessions/:sessionId/interrupt', async ({ request, params }) => {
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
      { initialProps: { connectionState: 'disconnected' as const } },
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.isReconnecting).toBe(true)

    // Simulate reconnection
    rerender({ connectionState: 'connected' as const })

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
    await vi.runAllTimersAsync()

    expect(interruptRequests.length).toBeGreaterThan(0)
    expect(interruptRequests[0].url).toContain('session-123/interrupt')
    expect(onInterrupted).toHaveBeenCalled()
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

    await vi.runAllTimersAsync()

    expect(result.current.isReconnecting).toBe(false)
    expect(onInterrupted).toHaveBeenCalled()
    expect(interruptRequests.length).toBeGreaterThan(0)
    expect(interruptRequests[0].url).toContain('session-123/interrupt')
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

    await vi.runAllTimersAsync()

    // Should have retried (callCount reached 2)
    expect(callCount).toBe(2)
    expect(onInterrupted).toHaveBeenCalled()
  })
})
