import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ConnectionIndicator } from '@/components/session/ConnectionIndicator'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ConnectionIndicator', () => {
  it('estado connected com RTT < 150ms → dot verde', () => {
    render(
      <ConnectionIndicator connectionState="connected" rtt={45} packetLoss={0.5} />,
    )
    const indicator = screen.getByRole('status')
    expect(indicator).toBeInTheDocument()
    // O dot está dentro do indicator — verificar via aria-label
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('boa'))
    // Verificar que o dot tem classe green
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-green-500')
  })

  it('estado connected com RTT > 300ms → dot vermelho', () => {
    render(
      <ConnectionIndicator connectionState="connected" rtt={350} packetLoss={0} />,
    )
    const indicator = screen.getByRole('status')
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('ruim'))
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-red-500')
  })

  it('estado connected com RTT entre 150-300ms → dot amarelo (instável)', () => {
    render(
      <ConnectionIndicator connectionState="connected" rtt={200} packetLoss={1} />,
    )
    const indicator = screen.getByRole('status')
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('instável'))
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-yellow-500')
  })

  it('estado connecting → dot cinza', () => {
    render(<ConnectionIndicator connectionState="connecting" />)
    const indicator = screen.getByRole('status')
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('conectando'))
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-gray-400')
  })

  it('estado new → dot cinza', () => {
    render(<ConnectionIndicator connectionState="new" />)
    const indicator = screen.getByRole('status')
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-gray-400')
  })

  it('estado failed → dot vermelho', () => {
    render(<ConnectionIndicator connectionState="failed" />)
    const indicator = screen.getByRole('status')
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('falha'))
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-red-500')
  })

  it('estado disconnected → dot vermelho', () => {
    render(<ConnectionIndicator connectionState="disconnected" />)
    const indicator = screen.getByRole('status')
    expect(indicator).toHaveAttribute('aria-label', expect.stringContaining('desconect'))
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-red-500')
  })

  it('aria-label está presente em todos os estados', () => {
    const states = ['new', 'connecting', 'connected', 'disconnected', 'failed'] as const

    for (const state of states) {
      const { unmount } = render(<ConnectionIndicator connectionState={state} />)
      const indicator = screen.getByRole('status')
      expect(indicator).toHaveAttribute('aria-label')
      expect(indicator.getAttribute('aria-label')).not.toBe('')
      unmount()
    }
  })

  it('perda de pacotes > 5% → dot vermelho mesmo com RTT baixo', () => {
    render(
      <ConnectionIndicator connectionState="connected" rtt={100} packetLoss={7} />,
    )
    const indicator = screen.getByRole('status')
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-red-500')
  })

  it('perda de pacotes 2-5% → dot amarelo (instável)', () => {
    render(
      <ConnectionIndicator connectionState="connected" rtt={100} packetLoss={3} />,
    )
    const indicator = screen.getByRole('status')
    const dot = indicator.querySelector('span[aria-hidden]')
    expect(dot?.className).toContain('bg-yellow-500')
  })

  it('sem RTT e sem packetLoss em estado connected → dot cinza (desconhecido)', () => {
    render(<ConnectionIndicator connectionState="connected" />)
    const indicator = screen.getByRole('status')
    const dot = indicator.querySelector('span[aria-hidden]')
    // Sem métricas disponíveis → qualidade unknown → cinza
    expect(dot?.className).toContain('bg-gray-400')
  })
})
