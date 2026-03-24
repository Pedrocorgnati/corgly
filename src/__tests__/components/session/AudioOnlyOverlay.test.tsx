import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AudioOnlyOverlay } from '@/components/session/AudioOnlyOverlay'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AudioOnlyOverlay', () => {
  it('renderiza iniciais do peer corretamente', () => {
    render(
      <AudioOnlyOverlay
        peerName="João Silva"
        peerInitials="JS"
        isAudioActive={true}
      />,
    )

    expect(screen.getByText('JS')).toBeInTheDocument()
  })

  it('renderiza nome do peer', () => {
    render(
      <AudioOnlyOverlay
        peerName="Maria Costa"
        peerInitials="MC"
        isAudioActive={false}
      />,
    )

    expect(screen.getByText('Maria Costa')).toBeInTheDocument()
  })

  it('exibe waveform animado quando isAudioActive=true', () => {
    const { container } = render(
      <AudioOnlyOverlay
        peerName="João"
        peerInitials="J"
        isAudioActive={true}
      />,
    )

    const bars = container.querySelectorAll('.animate-waveform')
    expect(bars.length).toBe(3)
  })

  it('waveform parado quando isAudioActive=false', () => {
    const { container } = render(
      <AudioOnlyOverlay
        peerName="João"
        peerInitials="J"
        isAudioActive={false}
      />,
    )

    const animatedBars = container.querySelectorAll('.animate-waveform')
    expect(animatedBars.length).toBe(0)

    // Bars should have reduced opacity
    const bars = container.querySelectorAll('.opacity-40')
    expect(bars.length).toBe(3)
  })

  it('exibe banner "Modo apenas áudio"', () => {
    render(
      <AudioOnlyOverlay
        peerName="Test"
        peerInitials="T"
        isAudioActive={true}
      />,
    )

    expect(screen.getByText('Modo apenas áudio')).toBeInTheDocument()
  })

  it('possui aria-label correto para acessibilidade', () => {
    render(
      <AudioOnlyOverlay
        peerName="Ana"
        peerInitials="A"
        isAudioActive={true}
      />,
    )

    const overlay = screen.getByLabelText('Modo apenas áudio. Ana está conectado via áudio.')
    expect(overlay).toBeInTheDocument()
  })

  it('trunca nome longo do peer', () => {
    render(
      <AudioOnlyOverlay
        peerName="Nome Muito Longo Que Deveria Ser Truncado Com Ellipsis"
        peerInitials="NM"
        isAudioActive={false}
      />,
    )

    const nameEl = screen.getByText('Nome Muito Longo Que Deveria Ser Truncado Com Ellipsis')
    expect(nameEl.className).toContain('truncate')
  })

  it('banner tem estilo visual amarelo', () => {
    render(
      <AudioOnlyOverlay
        peerName="Test"
        peerInitials="T"
        isAudioActive={true}
      />,
    )

    const banner = screen.getByText('Modo apenas áudio')
    expect(banner.className).toContain('text-yellow-600')
  })
})
