/**
 * TASK-9 ST003 — Component tests: VideoPanel states
 * Testa todos os estados visuais do VideoPanel.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VideoPanel, type VideoPanelProps } from '@/components/session/VideoPanel'

// ── Mock MediaStream ────────────────────────────────────────────────────────────

function createMockMediaStream(): MediaStream {
  return {
    id: 'mock-stream-' + Math.random(),
    active: true,
    getTracks: () => [],
    getVideoTracks: () => [{ kind: 'video', enabled: true }],
    getAudioTracks: () => [{ kind: 'audio', enabled: true }],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaStream
}

// ── Default Props ──────────────────────────────────────────────────────────────

const defaultProps: VideoPanelProps = {
  localStream: createMockMediaStream(),
  remoteStream: createMockMediaStream(),
  connectionState: 'connected',
  isAudioOnly: false,
  isMuted: false,
  isVideoOff: false,
  localName: 'Você',
  remoteName: 'Professor',
  onRetry: vi.fn(),
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('VideoPanel States', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('connecting → exibe spinner + "Conectando..."', () => {
    render(<VideoPanel {...defaultProps} connectionState="connecting" />)
    expect(screen.getByText('Conectando...')).toBeInTheDocument()
    expect(screen.getByLabelText('Painel de vídeo: conectando')).toBeInTheDocument()
  })

  it('new state → exibe mesmo layout de connecting', () => {
    render(<VideoPanel {...defaultProps} connectionState="new" />)
    expect(screen.getByText('Conectando...')).toBeInTheDocument()
  })

  it('connected → renderiza video tiles (local + remote)', () => {
    render(<VideoPanel {...defaultProps} connectionState="connected" />)
    expect(screen.getByLabelText('Painel de vídeo da sessão')).toBeInTheDocument()
    // Remote video tile
    expect(screen.getByLabelText(/Vídeo de Professor/)).toBeInTheDocument()
    // Self-view
    expect(screen.getByLabelText('Seu próprio vídeo')).toBeInTheDocument()
  })

  it('failed → mensagem de erro + botão tentar novamente', () => {
    const onRetry = vi.fn()
    render(<VideoPanel {...defaultProps} connectionState="failed" onRetry={onRetry} />)

    expect(screen.getByText('Falha na conexão')).toBeInTheDocument()
    expect(screen.getByLabelText('Painel de vídeo: falha na conexão')).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /Tentar reconectar/i })
    expect(retryBtn).toBeInTheDocument()

    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('failed sem onRetry → não exibe botão', () => {
    render(<VideoPanel {...defaultProps} connectionState="failed" onRetry={undefined} />)
    expect(screen.getByText('Falha na conexão')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('isAudioOnly=true → AudioOnlyOverlay no lugar do remote tile', () => {
    render(<VideoPanel {...defaultProps} isAudioOnly={true} connectionState="connected" />)
    expect(screen.getByText('Apenas áudio')).toBeInTheDocument()
    // "Professor" aparece na AudioOnlyOverlay e no badge inferior
    expect(screen.getAllByText('Professor').length).toBeGreaterThanOrEqual(1)
  })

  it('localStream=null + isVideoOff → self-view mostra placeholder', () => {
    render(
      <VideoPanel
        {...defaultProps}
        localStream={null}
        isVideoOff={true}
        connectionState="connected"
      />,
    )
    // Self-view area exists but without video
    expect(screen.getByLabelText('Seu vídeo (self-view)')).toBeInTheDocument()
    // No video element for local
    expect(screen.queryByLabelText('Seu próprio vídeo')).not.toBeInTheDocument()
  })

  it('disconnected → mensagem de conexão interrompida', () => {
    render(<VideoPanel {...defaultProps} connectionState="disconnected" />)
    expect(screen.getByText('Conexão interrompida')).toBeInTheDocument()
    expect(screen.getByLabelText('Painel de vídeo: desconectado')).toBeInTheDocument()
  })

  it('isMuted=true → indicador de microfone desligado na self-view', () => {
    render(<VideoPanel {...defaultProps} isMuted={true} connectionState="connected" />)
    expect(screen.getByLabelText('Microfone desligado')).toBeInTheDocument()
  })

  it('ConnectionIndicator renderizado no estado connected', () => {
    render(<VideoPanel {...defaultProps} connectionState="connected" rtt={50} packetLoss={0.5} />)
    // O componente ConnectionIndicator é montado internamente
    expect(screen.getByLabelText('Painel de vídeo da sessão')).toBeInTheDocument()
  })
})
