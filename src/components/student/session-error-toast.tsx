'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

const ERROR_MESSAGES: Record<string, { message: string; variant: 'error' | 'success' }> = {
  session_not_found: { message: 'Sessão não encontrada', variant: 'error' },
  unauthorized: { message: 'Você não tem acesso a esta sessão', variant: 'error' },
}

const SUCCESS_MESSAGES: Record<string, { message: string; variant: 'success' }> = {
  completed: { message: 'Aula finalizada com sucesso!', variant: 'success' },
}

export function SessionErrorToast() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const hasShown = useRef(false)

  useEffect(() => {
    if (hasShown.current) return

    const error = searchParams.get('error')
    const sessionStatus = searchParams.get('session')

    if (error && ERROR_MESSAGES[error]) {
      hasShown.current = true
      toast.error(ERROR_MESSAGES[error].message)
    } else if (sessionStatus && SUCCESS_MESSAGES[sessionStatus]) {
      hasShown.current = true
      toast.success(SUCCESS_MESSAGES[sessionStatus].message)
    } else {
      return // No relevant params — don't clean URL
    }

    // Clean URL without reload
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    url.searchParams.delete('session')
    router.replace(url.pathname + url.search, { scroll: false })
  }, [searchParams, router])

  return null
}
