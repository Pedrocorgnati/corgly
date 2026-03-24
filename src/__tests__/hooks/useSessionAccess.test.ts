import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSessionAccess } from '@/hooks/useSessionAccess'

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useSessionAccess', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('6 minutos antes → canEnterNow=false, countdown > 0', () => {
    const session = { startAt: minutesFromNow(6) }
    const { result } = renderHook(() => useSessionAccess(session))

    expect(result.current.canEnterNow).toBe(false)
    expect(result.current.countdown).toBeGreaterThan(0)
  })

  it('5 minutos antes (exato da tolerância) → canEnterNow=true, countdown=0', () => {
    // canEnter retorna true quando now >= startAt - 5min
    // Então 5min antes = exatamente no limiar = canEnterNow=true
    const session = { startAt: minutesFromNow(5) }
    const { result } = renderHook(() => useSessionAccess(session))

    expect(result.current.canEnterNow).toBe(true)
    expect(result.current.countdown).toBe(0)
  })

  it('após o horário de início → canEnterNow=true, countdown=0', () => {
    const session = { startAt: minutesFromNow(-2) } // 2 min atrás
    const { result } = renderHook(() => useSessionAccess(session))

    expect(result.current.canEnterNow).toBe(true)
    expect(result.current.countdown).toBe(0)
  })

  it('countdown decrementa a cada tick de 1 segundo', () => {
    const session = { startAt: minutesFromNow(10) } // 10min → 5min de espera real
    const { result } = renderHook(() => useSessionAccess(session))

    const initialCountdown = result.current.countdown
    expect(initialCountdown).toBeGreaterThan(0)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.countdown).toBe(initialCountdown - 1)
  })

  it('countdown não decresce abaixo de 0', () => {
    const session = { startAt: minutesFromNow(5.01) } // levemente acima do limiar

    const { result } = renderHook(() => useSessionAccess(session))

    // Avançar além do tempo necessário
    act(() => {
      vi.advanceTimersByTime(60 * 1000) // 1 minuto
    })

    expect(result.current.countdown).toBeGreaterThanOrEqual(0)
  })

  it('canEnterNow muda para true quando countdown chega a 0', () => {
    // 6 minutos antes = 1 minuto antes da tolerância de 5min
    const session = { startAt: minutesFromNow(6) }
    const { result } = renderHook(() => useSessionAccess(session))

    expect(result.current.canEnterNow).toBe(false)

    // Avançar 1 minuto e 1 segundo = agora está dentro dos 5min de tolerância
    act(() => {
      vi.advanceTimersByTime(61 * 1000)
    })

    expect(result.current.canEnterNow).toBe(true)
    expect(result.current.countdown).toBe(0)
  })

  it('formattedCountdown retorna formato MM:SS', () => {
    const session = { startAt: minutesFromNow(6.5) } // ~90s de espera
    const { result } = renderHook(() => useSessionAccess(session))

    const formatted = result.current.formattedCountdown
    // Deve seguir o padrão MM:SS
    expect(formatted).toMatch(/^\d{2}:\d{2}$/)
  })

  it('formattedCountdown para 0 segundos é "00:00"', () => {
    const session = { startAt: minutesFromNow(4) } // já pode entrar
    const { result } = renderHook(() => useSessionAccess(session))

    expect(result.current.formattedCountdown).toBe('00:00')
  })

  it('formattedCountdown para 90 segundos é "01:30"', () => {
    // 6.5 minutos = 6min30s de countdown antes de entrar
    // canEnter = 5min antes → precisamos de startAt = agora + 6min30s
    // countdown = (startAt - 5min) - now = 6.5min - 5min = 1.5min = 90s
    const startAt = new Date(Date.now() + 6.5 * 60 * 1000)
    const session = { startAt }
    const { result } = renderHook(() => useSessionAccess(session))

    // O countdown deve ser ~90 segundos
    expect(result.current.countdown).toBeCloseTo(90, -1)
    expect(result.current.formattedCountdown).toBe('01:30')
  })

  it('cleanup: clearInterval é chamado ao desmontar', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const session = { startAt: minutesFromNow(10) }
    const { unmount } = renderHook(() => useSessionAccess(session))

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
