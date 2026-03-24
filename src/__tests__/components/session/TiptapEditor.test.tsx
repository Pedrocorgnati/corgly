import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TiptapEditor } from '@/components/session/TiptapEditor'
import * as Y from 'yjs'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@tiptap/react', () => {
  const mockEditor = {
    isActive: vi.fn().mockReturnValue(false),
    chain: vi.fn().mockReturnValue({
      focus: vi.fn().mockReturnValue({
        toggleBold: vi.fn().mockReturnValue({ run: vi.fn() }),
        toggleItalic: vi.fn().mockReturnValue({ run: vi.fn() }),
        toggleHeading: vi.fn().mockReturnValue({ run: vi.fn() }),
        toggleBulletList: vi.fn().mockReturnValue({ run: vi.fn() }),
        toggleOrderedList: vi.fn().mockReturnValue({ run: vi.fn() }),
        setLink: vi.fn().mockReturnValue({ run: vi.fn() }),
      }),
    }),
  }

  return {
    useEditor: vi.fn().mockReturnValue(mockEditor),
    EditorContent: vi.fn(({ className }: { className?: string }) => (
      <div data-testid="editor-content" className={className} />
    )),
  }
})

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}))

vi.mock('@tiptap/extension-link', () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}))

vi.mock('@tiptap/extension-collaboration', () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}))

vi.mock('@tiptap/extension-collaboration-cursor', () => ({
  default: { configure: vi.fn().mockReturnValue({}) },
}))

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TiptapEditor', () => {
  const mockProvider = {
    awareness: { setLocalStateField: vi.fn() },
    destroy: vi.fn(),
  } as unknown as import('@hocuspocus/provider').HocuspocusProvider

  const defaultProps = {
    doc: new Y.Doc(),
    provider: mockProvider,
    userName: 'Professor Ana',
    userColor: '#4F46E5',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza o editor content', () => {
    render(<TiptapEditor {...defaultProps} />)
    expect(screen.getByTestId('editor-content')).toBeInTheDocument()
  })

  it('renderiza toolbar com botoes de formatacao', () => {
    render(<TiptapEditor {...defaultProps} />)

    expect(screen.getByTitle('Negrito (Ctrl+B)')).toBeInTheDocument()
    expect(screen.getByTitle('Italico (Ctrl+I)')).toBeInTheDocument()
    expect(screen.getByTitle('Titulo 1')).toBeInTheDocument()
    expect(screen.getByTitle('Titulo 2')).toBeInTheDocument()
    expect(screen.getByTitle('Lista com marcadores')).toBeInTheDocument()
    expect(screen.getByTitle('Lista numerada')).toBeInTheDocument()
    expect(screen.getByTitle('Inserir link')).toBeInTheDocument()
  })

  it('toolbar buttons possuem aria-pressed', () => {
    render(<TiptapEditor {...defaultProps} />)
    const boldButton = screen.getByTitle('Negrito (Ctrl+B)')
    expect(boldButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('isReadOnly=true esconde toolbar', () => {
    render(<TiptapEditor {...defaultProps} isReadOnly />)
    expect(screen.queryByTitle('Negrito (Ctrl+B)')).not.toBeInTheDocument()
  })

  it('possui aria-label no container', () => {
    render(<TiptapEditor {...defaultProps} />)
    expect(screen.getByLabelText('Editor de notas da aula')).toBeInTheDocument()
  })
})
