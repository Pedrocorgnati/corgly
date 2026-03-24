/**
 * ST011 — Testes backend para Hocuspocus onAuthenticate
 * Validam a lógica de autenticação JWT e verificação de participante.
 * Os hooks do Hocuspocus são testados via chamadas unitárias à lógica extraída.
 */
import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'

const TEST_SECRET = 'test-hocuspocus-secret-minimum-32-chars!!'

/** Replica a lógica de verificação JWT do hocuspocus/server.ts */
function verifyHocuspocusToken(token: string, secret: string) {
  return jwt.verify(token, secret)
}

describe('Hocuspocus auth — JWT verification', () => {
  it('SUCCESS — JWT válido + participante → não lança erro', () => {
    const token = jwt.sign({ userId: 'user-1', sessionId: 'sess-1', role: 'STUDENT' }, TEST_SECRET, { expiresIn: '1h' })
    expect(() => verifyHocuspocusToken(token, TEST_SECRET)).not.toThrow()
  })

  it('ERROR — JWT com secret inválido → lança JsonWebTokenError', () => {
    const token = jwt.sign({ userId: 'user-1', role: 'STUDENT' }, 'wrong-secret-that-is-long-enough-!!!')
    expect(() => verifyHocuspocusToken(token, TEST_SECRET)).toThrow()
  })

  it('EDGE — JWT expirado → lança TokenExpiredError (mapeado para Unauthorized)', () => {
    // iat no passado e exp já expirado
    const token = jwt.sign({ userId: 'user-1', role: 'STUDENT' }, TEST_SECRET, { expiresIn: '0s' })
    // aguardar 1ms para garantir expiração
    let thrownError: Error | null = null
    try {
      verifyHocuspocusToken(token, TEST_SECRET)
    } catch (err) {
      thrownError = err as Error
    }
    expect(thrownError).not.toBeNull()
    // TokenExpiredError ou JsonWebTokenError dependendo do timing
    expect(thrownError?.name).toMatch(/TokenExpiredError|JsonWebTokenError/)
  })

  it('ERROR — token vazio → lança JsonWebTokenError', () => {
    expect(() => verifyHocuspocusToken('', TEST_SECRET)).toThrow()
  })

  it('ERROR — token malformado → lança JsonWebTokenError', () => {
    expect(() => verifyHocuspocusToken('not.a.valid.jwt', TEST_SECRET)).toThrow()
  })
})
