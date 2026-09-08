'use client'

import { useTranslations } from 'next-intl'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type * as Y from 'yjs'

// ── Cursor CSS (injected globally) ─────────────────────────────────────────────

const CURSOR_STYLES = `
.collaboration-cursor__caret {
  border-left: 2px solid;
  border-right: none;
  margin-left: -1px;
  margin-right: -1px;
  pointer-events: none;
  position: relative;
  word-break: normal;
}

.collaboration-cursor__label {
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  color: white;
  white-space: nowrap;
  position: absolute;
  top: -1.4em;
  left: -1px;
  user-select: none;
  pointer-events: none;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
`

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TiptapEditorProps {
  doc: Y.Doc
  provider: HocuspocusProvider
  userName: string
  userColor: string
  isReadOnly?: boolean
}

// ── Toolbar Button ─────────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick: () => void
  isActive: boolean
  title: string
  children: React.ReactNode
  disabled?: boolean
  testId?: string
}

function ToolbarButton({ onClick, isActive, title, children, disabled, testId }: ToolbarButtonProps) {
  return (
    <button
      data-testid={testId}
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      title={title}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center rounded px-2 py-1 text-sm font-medium
        transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        disabled:pointer-events-none disabled:opacity-50
        ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}
      `}
    >
      {children}
    </button>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TiptapEditor({
  doc,
  provider,
  userName,
  userColor,
  isReadOnly = false,
}: TiptapEditorProps) {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido pelo aluno.
  const t = useTranslations('sessionRoom.editor')

  const editor = useEditor({
    editable: !isReadOnly,
    extensions: [
      StarterKit.configure({
        // O StarterKit renomeou a extensao `history` para `undoRedo`.
        // Continua desligada porque o Yjs cuida do undo/redo colaborativo.
        undoRedo: false,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Collaboration.configure({
        document: doc,
      }),
      CollaborationCursor.configure({
        provider,
        user: {
          name: userName.length > 20 ? `${userName.slice(0, 20)}...` : userName,
          color: userColor,
        },
      }),
    ],
  })

  const handleLinkInsert = () => {
    if (!editor) return
    const url = window.prompt(t('linkPrompt'))
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  return (
    <div data-testid="session-notes-editor" className="flex flex-1 flex-col" aria-label={t('editorAria')}>
      {/* Inject cursor styles */}
      <style dangerouslySetInnerHTML={{ __html: CURSOR_STYLES }} />

      {/* Toolbar */}
      {!isReadOnly && editor && (
        <div
          data-testid="session-notes-toolbar"
          role="toolbar"
          aria-label={t('toolbarAria')}
          className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-1"
        >
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title={t('bold')}
            testId="session-notes-bold-button"
          >
            B
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title={t('italic')}
            testId="session-notes-italic-button"
          >
            <em>I</em>
          </ToolbarButton>

          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title={t('heading1')}
            testId="session-notes-heading1-button"
          >
            H1
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title={t('heading2')}
            testId="session-notes-heading2-button"
          >
            H2
          </ToolbarButton>

          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title={t('bulletList')}
            testId="session-notes-bullet-list-button"
          >
            &bull;
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title={t('orderedList')}
            testId="session-notes-ordered-list-button"
          >
            1.
          </ToolbarButton>

          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

          <ToolbarButton
            onClick={handleLinkInsert}
            isActive={editor.isActive('link')}
            title={t('insertLink')}
            testId="session-notes-link-button"
          >
            Link
          </ToolbarButton>
        </div>
      )}

      {/* Editor content */}
      <div data-testid="session-notes-content" className="flex-1 overflow-y-auto p-4">
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none dark:prose-invert focus:outline-none"
        />
      </div>
    </div>
  )
}
