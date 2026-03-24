import type { IceServersConfig } from '@/types/sala-virtual'
import { generateTurnCredentials } from '@/lib/turn'
import { env } from '@/lib/env'

/** STUN servers gratuitos do Google */
export const STUN_SERVERS: IceServersConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

/**
 * Retorna a configuração completa de ICE servers (STUN + TURN).
 * O TURN é opcional: se TURN_SERVER_SECRET não estiver configurado, retorna apenas STUN.
 */
export function getIceServers(userId: string): IceServersConfig[] {
  const stun = [...STUN_SERVERS]

  const turnUrl = env.TURN_SERVER_URL
  const turnSecret = env.TURN_SERVER_SECRET

  if (!turnUrl || !turnSecret || turnSecret.length < 32) {
    return stun
  }

  const { username, credential } = generateTurnCredentials(userId, turnSecret)
  return [
    ...stun,
    { urls: turnUrl, username, credential },
  ]
}
