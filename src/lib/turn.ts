import 'server-only';
import { createHmac } from 'crypto'
import type { TurnCredentials } from '@/types/sala-virtual'

/**
 * Gera credenciais TURN temporárias via HMAC-SHA1.
 * Compatível com Coturn self-hosted.
 * TTL: 24h
 */
export function generateTurnCredentials(userId: string, secret: string): TurnCredentials {
  const timestamp = Math.floor(Date.now() / 1000) + 86400 // TTL 24h
  const username = `${timestamp}:${userId}`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  return { username, credential, ttl: 86400 }
}
