/**
 * TASK-9 ST004 — Component tests: TiptapEditor functional
 * Testa render, toolbar, read-only e acessibilidade.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TiptapEditor } from '@/components/session/TiptapEditor'

// ── Mocks (hoisted) ────────────────────────────────────────────────────────────

const {
  mockToggleBold,
  mockToggleItalic,
  mockFocus,
  mockChain,
  mockIsActive,
} = vi.hoisted(() => {
  const mockToggleBold = vi.fn().mockReturnValue({ run: vi.fn() })
  const mockToggleItalic = vi.fn().mockReturnValue({ run: vi.fn() })
  const mockFocus = vi.fn().mockReturnValue({
    toggleBold: mockToggleBold,
    toggleItalic: mockToggleItalic,
    toggleHeading: vi.fn().mockReturnValue({ run: vi.fn() }),
    toggleBulletList: vi.fn().mockReturnValue({ run: vi.fn() }),
    toggleOrderedList: vi.fn().mockReturnValue({ run: vi.fn() }),
    setLink: vi.fn().mockReturnValue({ run: vi.fn() }),
  })
  const mockChain = vi.fn().mockReturnValue({ focus: mockFocus })
  const mockIsActive = vi.fn().mockReturnValue(false)
  return { mockToggleBold, mockToggleItalic, mockFocus, mockChain, mockIsActive }
})

vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn().mockReturnValue({
    isActive: mockIsActive,
    chain: mockChain,
  }),
  EditorContent: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="editor-content" className={className} role="textbox" aria-label="Editor de notas da aula" />
  )),
}))

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

// ── Mocks Y.Doc and HocuspocusProvider ──────────────────────────────────────

const mockDoc = {} as import('yjs').Doc
const mockProvider = {
  awareness: { setLocalStateField: vi.fn() },
  destroy: vi.fn(),
} as unknown as import('@hocuspocus/provider').HocuspocusProvider

const defaultProps = {
  doc: mockDoc,
  provider: mockProvider,
  userName: 'Pedro',
  userColor: '#4F46E5',
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TiptapEditor Functional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsActive.mockReturnValue(false)
  })

  it('renderiza com toolbar completa', () => {
    render(<TiptapEditor {...defaultProps} />)

    expect(screen.getByRole('toolbar')).toBeInTheDocument()
    expect(screen.getByTitle('Negrito (Ctrl+B)')).toBeInTheDocument()
    expect(screen.getByTitle('Italico (Ctrl+I)')).toBeInTheDocument()
    expect(screen.getByTitle('Titulo 1')).toBeInTheDocument()
    expect(screen.getByTitle('Titulo 2')).toBeInTheDocument()
    expect(screen.getByTitle('Lista com marcadores')).toBeInTheDocument()
    expect(screen.getByTitle('Lista numerada')).toBeInTheDocument()
    expect(screen.getByTitle('Inserir link')).toBeInTheDocument()
  })

  it('toolbar bold button aciona toggleBold', () => {
    render(<TiptapEditor {...defaultProps} />)
    const boldBtn = screen.getByTitle('Negrito (Ctrl+B)')
    fireEvent.click(boldBtn)

    expect(mockChain).toHaveBeenCalled()
    expect(mockFocus).toHaveBeenCalled()
    expect(mockToggleBold).toHaveBeenCalled()
  })

  it('toolbar italic button aciona toggleItalic', () => {
    render(<TiptapEditor {...defaultProps} />)
    const italicBtn = screen.getByTitle('Italico (Ctrl+I)')
    fireEvent.click(italicBtn)

    expect(mockToggleItalic).toHaveBeenCalled()
  })

  it('isActive=true → bold button aria-pressed=true', () => {
    mockIsActive.mockImplementation((type: string) => type === 'bold')
    render(<TiptapEditor {...defaultProps} />)
    const boldBtn = screen.getByTitle('Negrito (Ctrl+B)')
    expect(boldBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('isReadOnly=true → toolbar não renderiza', () => {
    render(<TiptapEditor {...defaultProps} isReadOnly />)
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Negrito (Ctrl+B)')).not.toBeInTheDocument()
  })

  it('aria-label presente no container do editor', () => {
    render(<TiptapEditor {...defaultProps} />)
    const elements = screen.getAllByLabelText('Editor de notas da aula')
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })

  it('editor content é renderizado', () => {
    render(<TiptapEditor {...defaultProps} />)
    expect(screen.getByTestId('editor-content')).toBeInTheDocument()
  })
})
