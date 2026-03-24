import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getServerUser, validateSessionAccess } from '@/lib/session/validate-access'
import { canEnter } from '@/lib/session/canEnter'
import { getIceServers } from '@/lib/iceServers'
import { getSalaVirtualConfig } from '@/lib/config/sala-virtual'
import { SessionPageClient } from '@/components/session/SessionPageClient'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Sala de Aula',
  robots: 'noindex',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params

  if (!id) redirect(`${ROUTES.DASHBOARD}?error=session_not_found`)

  // Carregar sessao do banco
  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      studentId: true,
      status: true,
      startAt: true,
      endAt: true,
      extendedBy: true,
      student: {
        select: { id: true, name: true },
      },
    },
  })

  if (!session) redirect(`${ROUTES.DASHBOARD}?error=session_not_found`)

  // Verificar acesso
  const serverUser = await getServerUser()
  let currentUser: { userId: string; role: string }
  try {
    currentUser = await validateSessionAccess(
      { studentId: session.studentId },
      serverUser ?? undefined,
    )
  } catch {
    redirect(`${ROUTES.DASHBOARD}?error=unauthorized`)
  }

  // Passar iceServers apenas quando canEnter (evitar leak pre-sessao)
  const canEnterNow = canEnter(session, new Date())
  const iceServersData = canEnterNow ? getIceServers(currentUser.userId) : []

  let hocuspocusUrl = ''
  try {
    const config = getSalaVirtualConfig()
    hocuspocusUrl = config.NEXT_PUBLIC_HOCUSPOCUS_URL
  } catch {
    // Config may not be available in all environments
    hocuspocusUrl = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? 'ws://localhost:1234'
  }

  return (
    <SessionPageClient
      session={{
        id: session.id,
        startAt: session.startAt.toISOString(),
        endAt: session.endAt.toISOString(),
        status: session.status,
        extendedBy: session.extendedBy ?? 0,
        student: session.student,
      }}
      currentUser={{
        id: currentUser.userId,
        role: currentUser.role,
      }}
      iceServers={iceServersData}
      hocuspocusUrl={hocuspocusUrl}
    />
  )
}
