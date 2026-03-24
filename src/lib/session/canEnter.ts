/**
 * Retorna true se o usuário pode entrar na sala.
 * Tolerância: 5 minutos antes do horário marcado.
 */
export function canEnter(
  session: { startAt: Date | string },
  now: Date = new Date(),
): boolean {
  return now.getTime() >= new Date(session.startAt).getTime() - 5 * 60 * 1000
}

/**
 * Retorna segundos restantes até a sala abrir.
 * Negativo quando já aberta.
 */
export function secondsUntilEntry(
  session: { startAt: Date | string },
  now: Date = new Date(),
): number {
  return Math.ceil(
    (new Date(session.startAt).getTime() - 5 * 60 * 1000 - now.getTime()) / 1000,
  )
}
