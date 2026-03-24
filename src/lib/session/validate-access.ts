import { cookies } from 'next/headers'
import { AppError } from '@/lib/errors'
import { verifyJWT, COOKIE_NAME } from '@/lib/auth'

interface SessionLike {
  studentId: string
}

interface UserContext {
  userId: string
  role: string
}

/**
 * Retorna o usuário a partir do cookie httpOnly (Server Components).
 * Retorna null se não autenticado ou token inválido.
 */
export async function getServerUser(): Promise<UserContext | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null
    const payload = verifyJWT(token)
    return { userId: payload.sub, role: payload.role }
  } catch {
    return null
  }
}

/**
 * Verifica se o usuário autenticado pode acessar a sessão.
 * Aceita contexto explícito (API routes via headers) ou lê do cookie (Server Components).
 *
 * @throws AppError AUTH_001 (401) — não autenticado
 * @throws AppError AUTH_005 (403) — não é participante da sessão
 */
export async function validateSessionAccess(
  session: SessionLike,
  context?: UserContext,
): Promise<UserContext> {
  let userId: string
  let role: string

  if (context) {
    userId = context.userId
    role = context.role
  } else {
    const user = await getServerUser()
    if (!user) {
      throw new AppError('AUTH_001', 'Não autorizado. Faça login para continuar.', 401)
    }
    userId = user.userId
    role = user.role
  }

  const isParticipant = session.studentId === userId || role === 'ADMIN'
  if (!isParticipant) {
    throw new AppError('AUTH_005', 'Acesso negado: você não é participante desta sessão.', 403)
  }

  return { userId, role }
}
