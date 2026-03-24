'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseYjsProviderOptions {
  sessionId: string
  token: string
  hocuspocusUrl: string
  doc: Y.Doc
}

export interface UseYjsProviderReturn {
  provider: HocuspocusProvider | null
  isConnected: boolean
  isSynced: boolean
  destroy: () => void
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useYjsProvider({
  sessionId,
  token,
  hocuspocusUrl,
  doc,
}: UseYjsProviderOptions): UseYjsProviderReturn {
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isSynced, setIsSynced] = useState(false)

  const destroy = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.destroy()
      providerRef.current = null
      setIsConnected(false)
      setIsSynced(false)
    }
  }, [])

  useEffect(() => {
    const provider = new HocuspocusProvider({
      url: hocuspocusUrl,
      name: `session-${sessionId}`,
      token,
      document: doc,
      delay: 1000,
      maxAttempts: 30,
      onConnect() {
        setIsConnected(true)
      },
      onDisconnect() {
        setIsConnected(false)
        setIsSynced(false)
      },
      onSynced() {
        setIsSynced(true)
      },
      onAuthenticationFailed({ reason }) {
        console.error('[useYjsProvider] Falha na autenticacao:', reason)
        provider.destroy()
        setIsConnected(false)
        setIsSynced(false)
      },
    })

    providerRef.current = provider

    return () => {
      provider.destroy()
      providerRef.current = null
    }
  }, [sessionId, token, hocuspocusUrl, doc])

  return {
    provider: providerRef.current,
    isConnected,
    isSynced,
    destroy,
  }
}
