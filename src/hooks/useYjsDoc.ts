'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
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

// Ate 2026-09-07 o texto do banner era portugues cravado neste modulo e ignorava
// o idioma escolhido pelo aluno. Agora so a CHAVE mora aqui; a copy vem do catalogo.
const BANNER_KEY: Record<SyncStatus, 'syncing' | 'saved' | 'offline'> = {
  syncing: 'syncing',
  saved: 'saved',
  offline: 'offline',
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
  const t = useTranslations('sessionRoom.editor')
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
    syncBannerText: t(BANNER_KEY[syncStatus]),
    syncBannerVariant: BANNER_VARIANT[syncStatus],
  }
}
