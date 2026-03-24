import { describe, it, expect } from 'vitest'
import { canEnter, secondsUntilEntry } from '../canEnter'

describe('canEnter()', () => {
  const startAt = new Date('2026-03-20T14:00:00Z')

  it('retorna false 6 minutos antes', () => {
    const now = new Date('2026-03-20T13:54:00Z')
    expect(canEnter({ startAt }, now)).toBe(false)
  })

  it('retorna true exatamente 5 minutos antes', () => {
    const now = new Date('2026-03-20T13:55:00Z')
    expect(canEnter({ startAt }, now)).toBe(true)
  })

  it('retorna true durante a aula', () => {
    const now = new Date('2026-03-20T14:30:00Z')
    expect(canEnter({ startAt }, now)).toBe(true)
  })

  it('retorna true após o horário de término (evitar lock-out)', () => {
    const now = new Date('2026-03-20T15:00:00Z')
    expect(canEnter({ startAt }, now)).toBe(true)
  })

  it('aceita startAt como string ISO', () => {
    const startAtStr = '2026-03-20T14:00:00Z'
    const now = new Date('2026-03-20T13:55:00Z')
    expect(canEnter({ startAt: startAtStr }, now)).toBe(true)
  })
})

describe('secondsUntilEntry()', () => {
  it('retorna negativo quando já aberta', () => {
    const startAt = new Date('2026-03-20T14:00:00Z')
    const now = new Date('2026-03-20T14:10:00Z')
    expect(secondsUntilEntry({ startAt }, now)).toBeLessThan(0)
  })

  it('retorna positivo quando ainda não aberta', () => {
    const startAt = new Date('2026-03-20T14:00:00Z')
    const now = new Date('2026-03-20T13:50:00Z')
    expect(secondsUntilEntry({ startAt }, now)).toBeGreaterThan(0)
  })
})
