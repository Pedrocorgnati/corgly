'use client'

import { useTranslations } from 'next-intl'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'
import { EditorStatusBar } from './EditorStatusBar'
import { TiptapEditor } from './TiptapEditor'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EditorPanelProps {
  doc: Y.Doc
  provider: HocuspocusProvider
  userName: string
  userColor: string
  syncBannerText: string
  syncBannerVariant: 'info' | 'success' | 'warning'
  connectedUsers: number
  isReadOnly?: boolean
}

// ── Component ──────────────────────────────────────────────────────────────────

export function EditorPanel({
  doc,
  provider,
  userName,
  userColor,
  syncBannerText,
  syncBannerVariant,
  connectedUsers,
  isReadOnly = false,
}: EditorPanelProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido pelo aluno.
  const t = useTranslations('sessionRoom.editor')

  return (
    <section
      className="flex flex-col border-border bg-background max-md:h-[60vh] md:w-[65%] md:border-l"
      aria-label={t('panelAria')}
    >
      <EditorStatusBar
        syncBannerText={syncBannerText}
        syncBannerVariant={syncBannerVariant}
        connectedUsers={connectedUsers}
      />

      <TiptapEditor
        doc={doc}
        provider={provider}
        userName={userName}
        userColor={userColor}
        isReadOnly={isReadOnly}
      />
    </section>
  )
}
