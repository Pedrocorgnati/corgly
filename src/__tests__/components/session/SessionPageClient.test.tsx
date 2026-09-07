import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { SessionPageClient } from '@/components/session/SessionPageClient'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock all heavy hooks
const mockConnect = vi.fn()
const mockDisconnect = vi.fn()
const mockToggleAudio = vi.fn()
const mockToggleVideo = vi.fn()
const mockRestartIce = vi.fn()
const mockDestroyProvider = vi.fn()

vi.mock('@/hooks/useWebRTC', () => ({
  useWebRTC: () => ({
    localStream: null,
    remoteStream: null,
    connectionState: 'new' as const,
    connect: mockConnect,
    disconnect: mockDisconnect,
    toggleAudio: mockToggleAudio,
    toggleVideo: mockToggleVideo,
    restartIce: mockRestartIce,
    isMuted: false,
    isVideoOff: false,
    isAudioOnly: false,
    isRemoteAudioOnly: false,
  }),
}))

/**
 * Guarda as opcoes com que o componente monta o hook, para que o teste possa
 * disparar `onInterrupted` como o hook real dispara. `vi.hoisted` e necessario
 * porque o factory de `vi.mock` sobe acima dos imports.
 */
const reconnectCall = vi.hoisted(() => ({
  options: null as { onInterrupted?: (outcome: 'confirmed' | 'unconfirmed') => void } | null,
}))

vi.mock('@/hooks/useReconnect', () => ({
  useReconnect: (options: { onInterrupted?: (outcome: 'confirmed' | 'unconfirmed') => void }) => {
    reconnectCall.options = options
    return {
      isReconnecting: false,
      reconnectCountdown: 120,
      formattedCountdown: '02:00',
      cancelReconnect: vi.fn(),
      attemptCount: 0,
    }
  },
}))

vi.mock('@/hooks/useSessionAccess', () => ({
  useSessionAccess: vi.fn(() => ({
    canEnterNow: false,
    countdown: 300,
    formattedCountdown: '05:00',
  })),
}))

vi.mock('@/hooks/useSessionTimer', () => ({
  useSessionTimer: () => ({
    timeRemaining: 3600,
    isWarning: false,
    isCritical: false,
    isEnded: false,
    formattedTime: '60:00',
    timerColor: 'text-green-500',
    start: vi.fn(),
    extend: vi.fn(),
  }),
}))

vi.mock('@/hooks/useYjsDoc', () => ({
  useYjsDoc: () => ({
    doc: {},
    syncStatus: 'saved',
    syncBannerText: 'Salvo',
    syncBannerVariant: 'success',
  }),
}))

vi.mock('@/hooks/useYjsProvider', () => ({
  useYjsProvider: () => ({
    provider: null,
    isConnected: false,
    isSynced: false,
    destroy: mockDestroyProvider,
  }),
}))

// Mock sub-components to simplify tests
vi.mock('@/components/session/VideoPanel', () => ({
  VideoPanel: () => <div data-testid="video-panel">VideoPanel</div>,
}))

vi.mock('@/components/session/EditorPanel', () => ({
  EditorPanel: () => <div data-testid="editor-panel">EditorPanel</div>,
}))

vi.mock('@/components/session/ReconnectingOverlay', () => ({
  ReconnectingOverlay: () => <div data-testid="reconnecting-overlay">ReconnectingOverlay</div>,
}))

vi.mock('@/components/session/AudioOnlyOverlay', () => ({
  AudioOnlyOverlay: () => <div data-testid="audio-only-overlay">AudioOnlyOverlay</div>,
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

const defaultProps = {
  session: {
    id: 'session-123',
    startAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min future
    endAt: new Date(Date.now() + 70 * 60 * 1000).toISOString(), // 70 min future
    status: 'SCHEDULED',
    extendedBy: 0,
    student: { id: 'student-1', name: 'Ana Clara' },
  },
  currentUser: { id: 'user-1', role: 'STUDENT' },
  iceServers: [],
  hocuspocusUrl: 'ws://localhost:1234',
}

describe('SessionPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render WAITING state with countdown and disabled button', () => {
    render(<SessionPageClient {...defaultProps} />)
    expect(screen.getByText(/A sala abre em/)).toBeInTheDocument()
    expect(screen.getByText('Entrar na sala')).toBeDisabled()
  })

  it('should render READY state when canEnterNow becomes true', async () => {
    const { useSessionAccess } = await import('@/hooks/useSessionAccess')
    vi.mocked(useSessionAccess).mockReturnValue({
      canEnterNow: true,
      countdown: 0,
      formattedCountdown: '00:00',
    })

    render(<SessionPageClient {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('A sala está disponível!')).toBeInTheDocument()
    })

    const enterButton = screen.getByText('Entrar na sala')
    expect(enterButton).not.toBeDisabled()
  })

  it('should render ENDED state when session status is COMPLETED', () => {
    render(
      <SessionPageClient
        {...defaultProps}
        session={{ ...defaultProps.session, status: 'COMPLETED' }}
      />,
    )
    expect(screen.getByText('Aula finalizada')).toBeInTheDocument()
    expect(screen.getByText('Avaliar aula')).toBeInTheDocument()
    expect(screen.getByText('Voltar ao Dashboard')).toBeInTheDocument()
  })

  it('should render INTERRUPTED state when session status is INTERRUPTED', () => {
    render(
      <SessionPageClient
        {...defaultProps}
        session={{ ...defaultProps.session, status: 'INTERRUPTED' }}
      />,
    )
    expect(screen.getByText('Sessão interrompida')).toBeInTheDocument()
    expect(
      screen.getByText(/1 crédito foi devolvido/),
    ).toBeInTheDocument()
    expect(screen.getByText('Contato')).toBeInTheDocument()
  })

  /**
   * Zero Silencio: quando as duas tentativas do PATCH de interrupt falham, o
   * hook entrega `unconfirmed` e a tela NAO pode afirmar que o credito voltou —
   * o cliente nao tem como saber disso.
   */
  it('should admit that the interrupt was not confirmed by the server', async () => {
    render(<SessionPageClient {...defaultProps} />)

    expect(reconnectCall.options?.onInterrupted).toBeTypeOf('function')
    await act(async () => {
      reconnectCall.options?.onInterrupted?.('unconfirmed')
    })

    expect(screen.getByTestId('page-session-interrupted')).toBeInTheDocument()
    expect(screen.getByTestId('session-interrupted-unconfirmed')).toHaveTextContent(
      /Não conseguimos avisar o servidor/,
    )
    expect(screen.queryByTestId('session-interrupted-confirmed')).not.toBeInTheDocument()
    expect(screen.queryByText(/1 crédito foi devolvido/)).not.toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(
      'Não conseguimos confirmar o aviso de interrupção ao servidor.',
    )
  })

  it('should confirm the credit refund when the server acknowledged the interrupt', async () => {
    render(<SessionPageClient {...defaultProps} />)

    await act(async () => {
      reconnectCall.options?.onInterrupted?.('confirmed')
    })

    expect(screen.getByTestId('session-interrupted-confirmed')).toHaveTextContent(
      /1 crédito foi devolvido/,
    )
    expect(screen.queryByTestId('session-interrupted-unconfirmed')).not.toBeInTheDocument()
  })

  it('should show "Avaliar aula" link pointing to feedback page', () => {
    render(
      <SessionPageClient
        {...defaultProps}
        session={{ ...defaultProps.session, status: 'COMPLETED' }}
      />,
    )
    const link = screen.getByText('Avaliar aula').closest('a')
    expect(link).toHaveAttribute('href', '/session/session-123/feedback')
  })

  it('should show "Voltar ao Dashboard" link in ENDED state', () => {
    render(
      <SessionPageClient
        {...defaultProps}
        session={{ ...defaultProps.session, status: 'COMPLETED' }}
      />,
    )
    const link = screen.getByText('Voltar ao Dashboard').closest('a')
    expect(link).toHaveAttribute('href', '/dashboard')
  })
})
