'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import * as Y from 'yjs'

// ── Types ──────────────────────────────────────────────────────────────────────

export type SyncStatus = 'syncing' | 'saved' | 'offline'

export interface UseYjsDocOptions {
  sessionId: string
  isConnected: boolean
  isSynced: boolean
}

export interface UseYjsDocReturn {
  doc: Y.Doc
  syncStatus: SyncStatus
  syncBannerText: string
  syncBannerVariant: 'info' | 'success' | 'warning'
}

// ── Banner mappings ────────────────────────────────────────────────────────────

const BANNER_TEXT: Record<SyncStatus, string> = {
  syncing: 'Sincronizando...',
  saved: 'Salvo',
  offline: 'Offline \u2014 altera\u00e7\u00f5es salvas localmente',
}

const BANNER_VARIANT: Record<SyncStatus, 'info' | 'success' | 'warning'> = {
  syncing: 'info',
  saved: 'success',
  offline: 'warning',
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useYjsDoc({
  sessionId,
  isConnected,
  isSynced,
}: UseYjsDocOptions): UseYjsDocReturn {
  const docRef = useRef<Y.Doc | null>(null)
  const persistenceRef = useRef<{ destroy: () => void } | null>(null)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)

  // Stable Y.Doc singleton
  if (!docRef.current) {
    docRef.current = new Y.Doc()
  }
  const doc = docRef.current

  // IndexedDB persistence for offline support
  useEffect(() => {
    let persistence: { destroy: () => void } | null = null

    async function initPersistence() {
      try {
        const { IndexeddbPersistence } = await import('y-indexeddb')
        persistence = new IndexeddbPersistence(`session-${sessionId}`, doc)
        persistenceRef.current = persistence
      } catch (err) {
        console.warn(
          '[useYjsDoc] IndexedDB indisponivel (private browsing?). Persistencia local desabilitada.',
          err,
        )
      }
    }

    initPersistence()

    return () => {
      if (persistence) {
        persistence.destroy()
        persistenceRef.current = null
      }
    }
  }, [sessionId, doc])

  // Track doc updates for pending changes
  useEffect(() => {
    const onUpdate = () => {
      setHasPendingChanges(true)
    }

    doc.on('update', onUpdate)
    return () => {
      doc.off('update', onUpdate)
    }
  }, [doc])

  // Reset pending changes when synced
  useEffect(() => {
    if (isSynced) {
      setHasPendingChanges(false)
    }
  }, [isSynced])

  // Derive sync status
  const syncStatus: SyncStatus = useMemo(() => {
    if (!isConnected) return 'offline'
    if (isSynced && !hasPendingChanges) return 'saved'
    return 'syncing'
  }, [isConnected, isSynced, hasPendingChanges])

  // Cleanup doc on unmount
  useEffect(() => {
    return () => {
      if (docRef.current) {
        docRef.current.destroy()
        docRef.current = null
      }
    }
  }, [])

  return {
    doc,
    syncStatus,
    syncBannerText: BANNER_TEXT[syncStatus],
    syncBannerVariant: BANNER_VARIANT[syncStatus],
  }
}
