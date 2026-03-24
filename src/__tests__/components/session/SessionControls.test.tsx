import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SessionControls } from '@/components/session/SessionControls'

describe('SessionControls', () => {
  const defaultProps = {
    isMuted: false,
    isVideoOff: false,
    onToggleAudio: vi.fn(),
    onToggleVideo: vi.fn(),
    onLeave: vi.fn(),
  }

  it('should render mute, camera, and leave buttons', () => {
    render(<SessionControls {...defaultProps} />)
    expect(screen.getByLabelText('Silenciar microfone')).toBeInTheDocument()
    expect(screen.getByLabelText('Desligar câmera')).toBeInTheDocument()
    expect(screen.getByLabelText('Encerrar aula')).toBeInTheDocument()
  })

  it('should call onToggleAudio when mute button is clicked', () => {
    const onToggleAudio = vi.fn()
    render(<SessionControls {...defaultProps} onToggleAudio={onToggleAudio} />)

    fireEvent.click(screen.getByLabelText('Silenciar microfone'))
    expect(onToggleAudio).toHaveBeenCalledTimes(1)
  })

  it('should call onToggleVideo when camera button is clicked', () => {
    const onToggleVideo = vi.fn()
    render(<SessionControls {...defaultProps} onToggleVideo={onToggleVideo} />)

    fireEvent.click(screen.getByLabelText('Desligar câmera'))
    expect(onToggleVideo).toHaveBeenCalledTimes(1)
  })

  it('should show "Ativar microfone" label when muted', () => {
    render(<SessionControls {...defaultProps} isMuted={true} />)
    expect(screen.getByLabelText('Ativar microfone')).toBeInTheDocument()
  })

  it('should show "Ligar câmera" label when video off', () => {
    render(<SessionControls {...defaultProps} isVideoOff={true} />)
    expect(screen.getByLabelText('Ligar câmera')).toBeInTheDocument()
  })

  it('should open ConfirmModal when leave button is clicked', () => {
    render(<SessionControls {...defaultProps} />)

    fireEvent.click(screen.getByLabelText('Encerrar aula'))
    expect(screen.getByText('Encerrar aula?')).toBeInTheDocument()
    expect(screen.getByText('Você tem certeza que deseja encerrar a aula?')).toBeInTheDocument()
  })

  it('should call onLeave when confirm button in modal is clicked', () => {
    const onLeave = vi.fn()
    render(<SessionControls {...defaultProps} onLeave={onLeave} />)

    // Open modal
    fireEvent.click(screen.getByLabelText('Encerrar aula'))
    // Confirm
    fireEvent.click(screen.getByText('Encerrar'))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('should close modal when cancel is clicked', () => {
    render(<SessionControls {...defaultProps} />)

    fireEvent.click(screen.getByLabelText('Encerrar aula'))
    expect(screen.getByText('Encerrar aula?')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText('Encerrar aula?')).not.toBeInTheDocument()
  })

  it('should close modal on Escape key', () => {
    render(<SessionControls {...defaultProps} />)

    fireEvent.click(screen.getByLabelText('Encerrar aula'))
    expect(screen.getByText('Encerrar aula?')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Encerrar aula?')).not.toBeInTheDocument()
  })
})
