import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useYjsProvider } from '@/hooks/useYjsProvider'
import * as Y from 'yjs'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockDestroy = vi.fn()
const mockSocketDestroy = vi.fn()
let mockOnConnect: (() => void) | undefined
let mockOnDisconnect: (() => void) | undefined
let mockOnSynced: (() => void) | undefined
let mockOnAuthFailed: ((data: { reason: string }) => void) | undefined

// O hook monta DOIS objetos: o socket (`HocuspocusProviderWebsocket`), que
// carrega url + politica de reconexao, e o provider, que carrega name/token/doc
// e os callbacks. Mockar so o provider deixava o import do socket sem export.
vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProviderWebsocket: vi.fn().mockImplementation(() => ({
    destroy: mockSocketDestroy,
  })),
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

  it('cria socket com URL e politica de reconexao', async () => {
    const { HocuspocusProviderWebsocket } = await import('@hocuspocus/provider')
    renderHook(() => useYjsProvider(defaultOptions))

    // `delay`/`maxAttempts` pertencem ao socket. Enquanto iam no provider eram
    // descartados em runtime e a reconexao rodava no default da lib.
    expect(HocuspocusProviderWebsocket).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'ws://localhost:1234',
        delay: 1000,
        maxAttempts: 30,
      }),
    )
  })

  it('cria provider com name, token e o socket configurado', async () => {
    const { HocuspocusProvider, HocuspocusProviderWebsocket } = await import(
      '@hocuspocus/provider'
    )
    renderHook(() => useYjsProvider(defaultOptions))

    const socketInstance = vi.mocked(HocuspocusProviderWebsocket).mock.results[0]?.value

    expect(HocuspocusProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'session-test-session-123',
        token: 'jwt-token-abc',
        document: defaultOptions.doc,
        websocketProvider: socketInstance,
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

  it('onAuthenticationFailed destroi o provider e zera os flags', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useYjsProvider(defaultOptions))

    act(() => {
      mockOnConnect?.()
      mockOnSynced?.()
    })
    expect(result.current.isConnected).toBe(true)
    expect(result.current.isSynced).toBe(true)

    act(() => {
      mockOnAuthFailed?.({ reason: 'token expirado' })
    })

    expect(mockDestroy).toHaveBeenCalled()
    expect(result.current.isConnected).toBe(false)
    expect(result.current.isSynced).toBe(false)
    expect(consoleError).toHaveBeenCalledWith(
      '[useYjsProvider] Falha na autenticacao:',
      'token expirado',
    )

    consoleError.mockRestore()
  })

  it('destroy() chama provider.destroy()', () => {
    const { result } = renderHook(() => useYjsProvider(defaultOptions))

    act(() => {
      result.current.destroy()
    })

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('cleanup no unmount destroi provider e socket', () => {
    const { unmount } = renderHook(() => useYjsProvider(defaultOptions))
    unmount()
    expect(mockDestroy).toHaveBeenCalled()
    // Sem `socket.destroy()` o WebSocket sobrevive ao unmount e continua
    // tentando reconectar (ate 30 vezes) para uma sessao que ja saiu da tela.
    expect(mockSocketDestroy).toHaveBeenCalled()
  })
})
