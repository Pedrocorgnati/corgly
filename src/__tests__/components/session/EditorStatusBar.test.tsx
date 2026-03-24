import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorStatusBar } from '@/components/session/EditorStatusBar'

describe('EditorStatusBar', () => {
  it('exibe "Salvo" com variante success', () => {
    render(
      <EditorStatusBar
        syncBannerText="Salvo"
        syncBannerVariant="success"
        connectedUsers={2}
      />,
    )
    expect(screen.getByText('Salvo')).toBeInTheDocument()
  })

  it('exibe dot verde para variante success', () => {
    const { container } = render(
      <EditorStatusBar
        syncBannerText="Salvo"
        syncBannerVariant="success"
        connectedUsers={1}
      />,
    )
    const dot = container.querySelector('.bg-green-500')
    expect(dot).toBeInTheDocument()
  })

  it('exibe dot amarelo para variante warning', () => {
    const { container } = render(
      <EditorStatusBar
        syncBannerText="Offline"
        syncBannerVariant="warning"
        connectedUsers={0}
      />,
    )
    const dot = container.querySelector('.bg-yellow-500')
    expect(dot).toBeInTheDocument()
  })

  it('exibe dot azul para variante info', () => {
    const { container } = render(
      <EditorStatusBar
        syncBannerText="Sincronizando..."
        syncBannerVariant="info"
        connectedUsers={1}
      />,
    )
    const dot = container.querySelector('.bg-blue-500')
    expect(dot).toBeInTheDocument()
  })

  it('exibe "Apenas voce" quando connectedUsers=0', () => {
    render(
      <EditorStatusBar
        syncBannerText="Salvo"
        syncBannerVariant="success"
        connectedUsers={0}
      />,
    )
    expect(screen.getByText('Apenas voce')).toBeInTheDocument()
  })

  it('exibe "2 conectados" quando connectedUsers=2', () => {
    render(
      <EditorStatusBar
        syncBannerText="Salvo"
        syncBannerVariant="success"
        connectedUsers={2}
      />,
    )
    expect(screen.getByText('2 conectados')).toBeInTheDocument()
  })

  it('exibe "1 conectado" (singular) quando connectedUsers=1', () => {
    render(
      <EditorStatusBar
        syncBannerText="Salvo"
        syncBannerVariant="success"
        connectedUsers={1}
      />,
    )
    expect(screen.getByText('1 conectado')).toBeInTheDocument()
  })

  it('possui aria-live="polite"', () => {
    const { container } = render(
      <EditorStatusBar
        syncBannerText="Salvo"
        syncBannerVariant="success"
        connectedUsers={1}
      />,
    )
    expect(container.firstChild).toHaveAttribute('aria-live', 'polite')
  })
})
