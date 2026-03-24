import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ReconnectingOverlay } from '@/components/session/ReconnectingOverlay'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ReconnectingOverlay', () => {
  it('renderiza overlay quando isVisible=true', () => {
    render(
      <ReconnectingOverlay
        isVisible={true}
        countdown="01:45"
        attemptCount={2}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Reconectando...')).toBeInTheDocument()
    expect(screen.getByText('Tempo restante: 01:45')).toBeInTheDocument()
    expect(screen.getByText('Tentativa 2 de 12')).toBeInTheDocument()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()
  })

  it('não renderiza nada quando isVisible=false', () => {
    const { container } = render(
      <ReconnectingOverlay
        isVisible={false}
        countdown="02:00"
        attemptCount={0}
        onCancel={vi.fn()}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('exibe countdown atualizado corretamente', () => {
    const { rerender } = render(
      <ReconnectingOverlay
        isVisible={true}
        countdown="01:30"
        attemptCount={3}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Tempo restante: 01:30')).toBeInTheDocument()

    rerender(
      <ReconnectingOverlay
        isVisible={true}
        countdown="01:29"
        attemptCount={3}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Tempo restante: 01:29')).toBeInTheDocument()
  })

  it('botão Cancelar chama onCancel', () => {
    const onCancel = vi.fn()
    render(
      <ReconnectingOverlay
        isVisible={true}
        countdown="01:00"
        attemptCount={1}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByText('Cancelar'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('possui aria-live="assertive" para acessibilidade', () => {
    render(
      <ReconnectingOverlay
        isVisible={true}
        countdown="02:00"
        attemptCount={0}
        onCancel={vi.fn()}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
  })

  it('aplica animação pulse quando countdown < 30s', () => {
    render(
      <ReconnectingOverlay
        isVisible={true}
        countdown="00:25"
        attemptCount={9}
        onCancel={vi.fn()}
      />,
    )

    const countdownEl = screen.getByText('Tempo restante: 00:25')
    expect(countdownEl.className).toContain('animate-pulse')
  })

  it('não aplica animação pulse quando countdown >= 30s', () => {
    render(
      <ReconnectingOverlay
        isVisible={true}
        countdown="01:00"
        attemptCount={2}
        onCancel={vi.fn()}
      />,
    )

    const countdownEl = screen.getByText('Tempo restante: 01:00')
    expect(countdownEl.className).not.toContain('animate-pulse')
  })
})
