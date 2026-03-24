import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useYjsProvider } from '@/hooks/useYjsProvider'
import * as Y from 'yjs'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockDestroy = vi.fn()
let mockOnConnect: (() => void) | undefined
let mockOnDisconnect: (() => void) | undefined
let mockOnSynced: (() => void) | undefined
let mockOnAuthFailed: ((data: { reason: string }) => void) | undefined

vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: vi.fn().mockImplementation((opts: Record<string, unknown>) => {
    mockOnConnect = opts.onConnect as typeof mockOnConnect
    mockOnDisconnect = opts.onDisconnect as typeof mockOnDisconnect
    mockOnSynced = opts.onSynced as typeof mockOnSynced
    mockOnAuthFailed = opts.onAuthenticationFailed as typeof mockOnAuthFailed

    return {
      destroy: mockDestroy,
      awareness: { setLocalStateField: vi.fn() },
    }
  }),
}))

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useYjsProvider', () => {
  const defaultOptions = {
    sessionId: 'test-session-123',
    token: 'jwt-token-abc',
    hocuspocusUrl: 'ws://localhost:1234',
    doc: new Y.Doc(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnConnect = undefined
    mockOnDisconnect = undefined
    mockOnSynced = undefined
    mockOnAuthFailed = undefined
  })

  it('cria provider com URL, name e token corretos', async () => {
    const { HocuspocusProvider } = await import('@hocuspocus/provider')
    renderHook(() => useYjsProvider(defaultOptions))

    expect(HocuspocusProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'ws://localhost:1234',
        name: 'session-test-session-123',
        token: 'jwt-token-abc',
      }),
    )
  })

  it('inicia com isConnected=false e isSynced=false', () => {
    const { result } = renderHook(() => useYjsProvider(defaultOptions))
    expect(result.current.isConnected).toBe(false)
    expect(result.current.isSynced).toBe(false)
  })

  it('isConnected muda para true em onConnect', () => {
    const { result } = renderHook(() => useYjsProvider(defaultOptions))

    act(() => {
      mockOnConnect?.()
    })

    expect(result.current.isConnected).toBe(true)
  })

  it('isSynced muda para true em onSynced', () => {
    const { result } = renderHook(() => useYjsProvider(defaultOptions))

    act(() => {
      mockOnSynced?.()
    })

    expect(result.current.isSynced).toBe(true)
  })

  it('isConnected muda para false em onDisconnect', () => {
    const { result } = renderHook(() => useYjsProvider(defaultOptions))

    act(() => {
      mockOnConnect?.()
    })
    expect(result.current.isConnected).toBe(true)

    act(() => {
      mockOnDisconnect?.()
    })
    expect(result.current.isConnected).toBe(false)
  })

  it('destroy() chama provider.destroy()', () => {
    const { result } = renderHook(() => useYjsProvider(defaultOptions))

    act(() => {
      result.current.destroy()
    })

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('cleanup no unmount chama provider.destroy()', () => {
    const { unmount } = renderHook(() => useYjsProvider(defaultOptions))
    unmount()
    expect(mockDestroy).toHaveBeenCalled()
  })
})
