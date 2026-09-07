'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
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
    // `delay` e `maxAttempts` sao politica de reconexao do socket, nao do provider:
    // vivem em `HocuspocusProviderWebsocketConfiguration`. Passa-los direto no
    // `HocuspocusProvider` era ignorado em runtime e reprovado pelo tsc.
    const socket = new HocuspocusProviderWebsocket({
      url: hocuspocusUrl,
      delay: 1000,
      maxAttempts: 30,
    })

    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: `session-${sessionId}`,
      token,
      document: doc,
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
      socket.destroy()
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
