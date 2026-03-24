import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSessionTimer } from '@/hooks/useSessionTimer'

describe('useSessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should initialize with zero timeRemaining and not ended', () => {
    const { result } = renderHook(() => useSessionTimer())
    expect(result.current.timeRemaining).toBe(0)
    expect(result.current.isEnded).toBe(false) // endAt not set yet
    expect(result.current.formattedTime).toBe('00:00')
  })

  it('should start counting down from endAt', () => {
    const { result } = renderHook(() => useSessionTimer())
    const endAt = new Date(Date.now() + 600 * 1000) // 10 minutes

    act(() => {
      result.current.start(endAt)
    })

    expect(result.current.timeRemaining).toBeGreaterThanOrEqual(599)
    expect(result.current.timeRemaining).toBeLessThanOrEqual(600)
    expect(result.current.formattedTime).toMatch(/^(09|10):\d{2}$/)
  })

  it('should decrement timeRemaining after 1 second', () => {
    const { result } = renderHook(() => useSessionTimer())
    const endAt = new Date(Date.now() + 600 * 1000)

    act(() => {
      result.current.start(endAt)
    })

    const initial = result.current.timeRemaining

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.timeRemaining).toBeLessThan(initial)
  })

  it('should set isWarning when timeRemaining < 300', () => {
    const { result } = renderHook(() => useSessionTimer())
    const endAt = new Date(Date.now() + 299 * 1000) // 4min59s

    act(() => {
      result.current.start(endAt)
    })

    expect(result.current.isWarning).toBe(true)
    expect(result.current.timerColor).toBe('text-yellow-500')
  })

  it('should set isCritical when timeRemaining < 120', () => {
    const { result } = renderHook(() => useSessionTimer())
    const endAt = new Date(Date.now() + 119 * 1000) // 1min59s

    act(() => {
      result.current.start(endAt)
    })

    expect(result.current.isCritical).toBe(true)
    expect(result.current.timerColor).toBe('text-red-500')
  })

  it('should set isEnded when timeRemaining reaches 0', () => {
    const { result } = renderHook(() => useSessionTimer())
    const endAt = new Date(Date.now() + 2 * 1000) // 2 seconds

    act(() => {
      result.current.start(endAt)
    })

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.isEnded).toBe(true)
    expect(result.current.timeRemaining).toBe(0)
  })

  it('should show green color when >= 300 seconds', () => {
    const { result } = renderHook(() => useSessionTimer())
    const endAt = new Date(Date.now() + 600 * 1000) // 10 minutes

    act(() => {
      result.current.start(endAt)
    })

    expect(result.current.timerColor).toBe('text-green-500')
  })

  it('should extend the timer by N minutes', () => {
    const { result } = renderHook(() => useSessionTimer())
    const endAt = new Date(Date.now() + 60 * 1000) // 1 minute

    act(() => {
      result.current.start(endAt)
    })

    const beforeExtend = result.current.timeRemaining

    act(() => {
      result.current.extend(10) // +10 minutes
    })

    expect(result.current.timeRemaining).toBeGreaterThanOrEqual(beforeExtend + 590)
  })

  it('should format time as MM:SS zero-padded', () => {
    const { result } = renderHook(() => useSessionTimer())
    const endAt = new Date(Date.now() + 65 * 1000) // 1:05

    act(() => {
      result.current.start(endAt)
    })

    expect(result.current.formattedTime).toMatch(/^01:0[45]$/)
  })

  it('should cleanup interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const { result, unmount } = renderHook(() => useSessionTimer())

    act(() => {
      result.current.start(new Date(Date.now() + 600 * 1000))
    })

    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
