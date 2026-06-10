/**
 * Tipos do contrato entre o Server Component `SessionPage` e o
 * `SessionPageClient` (§12.4 – §12.5).
 *
 * `SessionClientUser.id` é SEMPRE o `sub` do JWT verificado via
 * `validateSessionAccess` — nunca um header `x-user-id` nem valor hardcoded.
 *
 * O token Hocuspocus (`NotesTokenFetchState`) é obtido exclusivamente via
 * `POST /api/v1/sessions/:id/notes/token` após a montagem do componente.
 * O provider WebSocket só conecta depois que `status === 'resolved'`.
 */

import type { IceServersConfig } from '@/types/sala-virtual'

// ── Authenticated user passed from server ─────────────────────────────────────

export interface SessionClientUser {
  /** JWT `sub` — UUID do usuário autenticado. */
  id: string
  /** `UserRole` canônico ('ADMIN' | 'STUDENT'). */
  role: string
  /** Nome exibido na interface; opcional pois o JWT não carrega `name`. */
  name?: string
}

// ── Session data passed from server ──────────────────────────────────────────

export interface SessionClientData {
  id: string
  startAt: string   // ISO 8601
  endAt: string     // ISO 8601
  status: string
  extendedBy: number
  student: { id: string; name: string }
}

// ── Notes token fetch state ───────────────────────────────────────────────────

export type NotesTokenFetchStatus = 'idle' | 'loading' | 'resolved' | 'error'

export interface NotesTokenFetchState {
  status: NotesTokenFetchStatus
  /** JWT assinado pelo servidor; não-vazio apenas quando `status === 'resolved'`. */
  token: string
  /** Mensagem de erro; não-vazio apenas quando `status === 'error'`. */
  error?: string
}

// ── Props canonical shape (mirrors SessionPageClient inline interface) ─────────

export interface SessionPageClientProps {
  session: SessionClientData
  currentUser: SessionClientUser
  iceServers: IceServersConfig[]
  hocuspocusUrl: string
}
