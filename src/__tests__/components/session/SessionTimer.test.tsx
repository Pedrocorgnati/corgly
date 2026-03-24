import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SessionTimer } from '@/components/session/SessionTimer'

describe('SessionTimer', () => {
  const defaultProps = {
    formattedTime: '45:32',
    timerColor: 'text-green-500',
    isCritical: false,
    isAdmin: false,
    onExtend: vi.fn(),
    totalExtended: 0,
  }

  it('should render the formatted time', () => {
    render(<SessionTimer {...defaultProps} />)
    expect(screen.getByRole('timer')).toHaveTextContent('45:32')
  })

  it('should apply the timerColor class', () => {
    render(<SessionTimer {...defaultProps} timerColor="text-red-500" />)
    const timer = screen.getByRole('timer')
    expect(timer.className).toContain('text-red-500')
  })

  it('should apply animate-pulse when isCritical', () => {
    const { container } = render(
      <SessionTimer {...defaultProps} isCritical={true} />,
    )
    // The container div should have animate-pulse
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('animate-pulse')
  })

  it('should NOT apply animate-pulse when not critical', () => {
    const { container } = render(
      <SessionTimer {...defaultProps} isCritical={false} />,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).not.toContain('animate-pulse')
  })

  it('should show extend button for admin', () => {
    render(<SessionTimer {...defaultProps} isAdmin={true} />)
    expect(screen.getByText('Estender +10min')).toBeInTheDocument()
  })

  it('should NOT show extend button for student', () => {
    render(<SessionTimer {...defaultProps} isAdmin={false} />)
    expect(screen.queryByText('Estender +10min')).not.toBeInTheDocument()
  })

  it('should call onExtend(10) when admin clicks extend button', () => {
    const onExtend = vi.fn()
    render(<SessionTimer {...defaultProps} isAdmin={true} onExtend={onExtend} />)

    fireEvent.click(screen.getByText('Estender +10min'))
    expect(onExtend).toHaveBeenCalledWith(10)
  })

  it('should disable extend button when totalExtended >= 60', () => {
    render(
      <SessionTimer {...defaultProps} isAdmin={true} totalExtended={60} />,
    )
    const button = screen.getByText('Estender +10min')
    expect(button).toBeDisabled()
  })
})
