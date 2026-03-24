import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useYjsDoc } from '@/hooks/useYjsDoc'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPersistenceDestroy = vi.fn()

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation(() => ({
    destroy: mockPersistenceDestroy,
    on: vi.fn(),
  })),
}))

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useYjsDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('syncStatus inicia como syncing quando conectado e nao sincronizado', () => {
    const { result } = renderHook(() =>
      useYjsDoc({ sessionId: 'sess-1', isConnected: true, isSynced: false }),
    )
    expect(result.current.syncStatus).toBe('syncing')
  })

  it('syncStatus=saved quando conectado e sincronizado', () => {
    const { result } = renderHook(() =>
      useYjsDoc({ sessionId: 'sess-1', isConnected: true, isSynced: true }),
    )
    expect(result.current.syncStatus).toBe('saved')
  })

  it('syncStatus=offline quando desconectado', () => {
    const { result } = renderHook(() =>
      useYjsDoc({ sessionId: 'sess-1', isConnected: false, isSynced: false }),
    )
    expect(result.current.syncStatus).toBe('offline')
  })

  it('banner text "Sincronizando..." quando syncing', () => {
    const { result } = renderHook(() =>
      useYjsDoc({ sessionId: 'sess-1', isConnected: true, isSynced: false }),
    )
    expect(result.current.syncBannerText).toBe('Sincronizando...')
    expect(result.current.syncBannerVariant).toBe('info')
  })

  it('banner text "Salvo" quando saved', () => {
    const { result } = renderHook(() =>
      useYjsDoc({ sessionId: 'sess-1', isConnected: true, isSynced: true }),
    )
    expect(result.current.syncBannerText).toBe('Salvo')
    expect(result.current.syncBannerVariant).toBe('success')
  })

  it('banner text "Offline" quando offline', () => {
    const { result } = renderHook(() =>
      useYjsDoc({ sessionId: 'sess-1', isConnected: false, isSynced: false }),
    )
    expect(result.current.syncBannerText).toBe(
      'Offline \u2014 altera\u00e7\u00f5es salvas localmente',
    )
    expect(result.current.syncBannerVariant).toBe('warning')
  })

  it('doc e estavel entre re-renders', () => {
    const { result, rerender } = renderHook(() =>
      useYjsDoc({ sessionId: 'sess-1', isConnected: true, isSynced: false }),
    )
    const doc1 = result.current.doc
    rerender()
    expect(result.current.doc).toBe(doc1)
  })

  it('transicao connected->disconnected muda para offline', () => {
    const { result, rerender } = renderHook(
      ({ isConnected, isSynced }) =>
        useYjsDoc({ sessionId: 'sess-1', isConnected, isSynced }),
      { initialProps: { isConnected: true, isSynced: true } },
    )
    expect(result.current.syncStatus).toBe('saved')

    rerender({ isConnected: false, isSynced: false })
    expect(result.current.syncStatus).toBe('offline')
  })
})
