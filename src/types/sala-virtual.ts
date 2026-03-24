// ─── WebRTC ───────────────────────────────────────────────────────────────────

export type SignalType = 'offer' | 'answer' | 'candidate'

export interface SessionSignal {
  type: SignalType
  payload: RTCSdpInit | RTCIceCandidateInit
  from: string       // userId
  timestamp: string  // ISO 8601
}

export interface IceServersConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

// ─── Session Page State ───────────────────────────────────────────────────────

export type SessionPageState =
  | 'WAITING'        // antes de 5min de tolerância
  | 'READY'          // canEnter() === true, aguardando clique
  | 'CONNECTING'     // WebRTC handshake em andamento
  | 'ACTIVE'         // P2P conectado
  | 'AUDIO_ONLY'     // fallback sem vídeo
  | 'RECONNECTING'   // ICE falhou, countdown 2min
  | 'INTERRUPTED'    // 2min sem reconexão, crédito reembolsado
  | 'ENDED'          // sessão encerrada normalmente

// ─── TURN ─────────────────────────────────────────────────────────────────────

export interface TurnCredentials {
  username: string   // "{timestamp}:{userId}"
  credential: string // base64 HMAC-SHA1
  ttl: number        // 86400s
}

// ─── Hocuspocus ───────────────────────────────────────────────────────────────

export interface HocuspocusAuthPayload {
  userId: string
  sessionId: string
  role: 'STUDENT' | 'ADMIN'
}
