/**
 * TASK-9 ST001 — Integration test: signaling flow
 * Testa o fluxo completo de signaling entre dois peers usando o SignalingService diretamente.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { SignalingService } from '@/services/signaling.service'
import type { SessionSignal } from '@/types/sala-virtual'

describe('Signaling Flow Integration', () => {
  let service: SignalingService
  const SESSION_ID = 'session-abc-123'
  const USER_A = 'student-001' // Peer A (student)
  const USER_B = 'admin-peer' // Peer B (admin/teacher)

  const mockOffer: RTCSdpInit = { type: 'offer', sdp: 'v=0\r\no=...' }
  const mockAnswer: RTCSdpInit = { type: 'answer', sdp: 'v=0\r\na=...' }
  const mockCandidate: RTCIceCandidateInit = {
    candidate: 'candidate:1 1 udp 2130706431 192.168.1.1 54321 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
  }

  beforeEach(() => {
    service = new SignalingService()
  })

  it('peer A cria offer → peer B recebe via GET → peer B cria answer → peer A recebe', () => {
    // 1. Peer A: POST offer (armazena para peer B)
    const offerSignal: SessionSignal = {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: new Date().toISOString(),
    }
    service.storeSignal(SESSION_ID, USER_B, offerSignal)

    // 2. Peer B: GET signals → recebe offer de peer A
    const signalsForB = service.getSignals(SESSION_ID, USER_B, USER_B)
    expect(signalsForB).toHaveLength(1)
    expect(signalsForB[0]).toMatchObject({
      type: 'offer',
      from: USER_A,
    })
    expect(signalsForB[0].payload).toEqual(mockOffer)

    // 3. Peer B: POST answer (armazena para peer A)
    const answerSignal: SessionSignal = {
      type: 'answer',
      payload: mockAnswer,
      from: USER_B,
      timestamp: new Date().toISOString(),
    }
    service.storeSignal(SESSION_ID, USER_A, answerSignal)

    // 4. Peer A: GET signals → recebe answer de peer B
    const signalsForA = service.getSignals(SESSION_ID, USER_A, USER_A)
    expect(signalsForA).toHaveLength(1)
    expect(signalsForA[0]).toMatchObject({
      type: 'answer',
      from: USER_B,
    })
    expect(signalsForA[0].payload).toEqual(mockAnswer)
  })

  it('ICE candidates são trocados corretamente', () => {
    // Peer A envia candidate para peer B
    const candidateFromA: SessionSignal = {
      type: 'candidate',
      payload: mockCandidate,
      from: USER_A,
      timestamp: new Date().toISOString(),
    }
    service.storeSignal(SESSION_ID, USER_B, candidateFromA)

    // Peer B envia candidate para peer A
    const candidateFromB: SessionSignal = {
      type: 'candidate',
      payload: { ...mockCandidate, candidate: 'candidate:2 1 udp 2130706431 10.0.0.1 12345 typ host' },
      from: USER_B,
      timestamp: new Date().toISOString(),
    }
    service.storeSignal(SESSION_ID, USER_A, candidateFromB)

    // Peer B recebe candidate de A
    const forB = service.getSignals(SESSION_ID, USER_B, USER_B)
    expect(forB).toHaveLength(1)
    expect(forB[0].type).toBe('candidate')
    expect(forB[0].from).toBe(USER_A)

    // Peer A recebe candidate de B
    const forA = service.getSignals(SESSION_ID, USER_A, USER_A)
    expect(forA).toHaveLength(1)
    expect(forA[0].type).toBe('candidate')
    expect(forA[0].from).toBe(USER_B)
  })

  it('after parameter filtra signals corretamente (não repete)', () => {
    const ts1 = '2026-03-21T10:00:00.000Z'
    const ts2 = '2026-03-21T10:00:01.000Z'
    const ts3 = '2026-03-21T10:00:02.000Z'

    // Armazenar 3 signals com timestamps diferentes
    service.storeSignal(SESSION_ID, USER_B, {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: ts1,
    })
    service.storeSignal(SESSION_ID, USER_B, {
      type: 'candidate',
      payload: mockCandidate,
      from: USER_A,
      timestamp: ts2,
    })
    service.storeSignal(SESSION_ID, USER_B, {
      type: 'candidate',
      payload: mockCandidate,
      from: USER_A,
      timestamp: ts3,
    })

    // GET com after=ts1 → retorna apenas signals após ts1 (ts2, ts3)
    const filtered = service.getSignals(SESSION_ID, USER_B, USER_B, ts1)
    expect(filtered).toHaveLength(2)
    expect(filtered[0].timestamp).toBe(ts2)
    expect(filtered[1].timestamp).toBe(ts3)
  })

  it('signals de sessão diferente não vazam entre rooms', () => {
    const SESSION_2 = 'session-xyz-456'

    service.storeSignal(SESSION_ID, USER_B, {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: new Date().toISOString(),
    })
    service.storeSignal(SESSION_2, USER_B, {
      type: 'offer',
      payload: mockAnswer,
      from: 'other-student',
      timestamp: new Date().toISOString(),
    })

    // Peer B da sessão 1 recebe apenas signals da sessão 1
    const forSession1 = service.getSignals(SESSION_ID, USER_B, USER_B)
    expect(forSession1).toHaveLength(1)
    expect(forSession1[0].from).toBe(USER_A)

    // Peer B da sessão 2 recebe apenas signals da sessão 2
    const forSession2 = service.getSignals(SESSION_2, USER_B, USER_B)
    expect(forSession2).toHaveLength(1)
    expect(forSession2[0].from).toBe('other-student')
  })

  it('clearSignals remove todos signals de uma sessão', () => {
    service.storeSignal(SESSION_ID, USER_B, {
      type: 'offer',
      payload: mockOffer,
      from: USER_A,
      timestamp: new Date().toISOString(),
    })
    service.storeSignal(SESSION_ID, USER_A, {
      type: 'answer',
      payload: mockAnswer,
      from: USER_B,
      timestamp: new Date().toISOString(),
    })

    service.clearSignals(SESSION_ID)

    const forB = service.getSignals(SESSION_ID, USER_B, USER_B)
    const forA = service.getSignals(SESSION_ID, USER_A, USER_A)
    expect(forB).toHaveLength(0)
    expect(forA).toHaveLength(0)
  })
})
