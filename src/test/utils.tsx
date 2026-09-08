import React from 'react'
import {
  render,
  renderHook,
  type RenderOptions,
  type RenderHookOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import ptBR from '../../i18n/messages/pt-BR.json'

/**
 * Ate 2026-09-07 este harness era um Fragment vazio e ninguem o importava, entao
 * cada teste de componente traduzido tinha que montar o proprio
 * NextIntlClientProvider — e quem esquecia quebrava com "Failed to call
 * useTranslations because the context from NextIntlClientProvider was not found".
 *
 * O catalogo real (pt-BR) entra aqui de proposito: teste que passa com um mock de
 * mensagens nao prova que a chave existe no catalogo enviado ao usuario.
 */
function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      {children}
    </NextIntlClientProvider>
  )
}

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => ({
  user: userEvent.setup(),
  ...render(ui, { wrapper: AllProviders, ...options }),
})

const customRenderHook = <Result, Props>(
  hook: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'wrapper'>,
) => renderHook(hook, { wrapper: AllProviders, ...options })

export * from '@testing-library/react'
export { customRender as render, customRenderHook as renderHook }
