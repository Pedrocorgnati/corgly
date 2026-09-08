import '@testing-library/jest-dom'
import { beforeAll, afterAll, afterEach, vi } from 'vitest'
import { createTranslator, createFormatter } from 'next-intl'
import { server } from './src/test/mocks/server'
import ptBR from './i18n/messages/pt-BR.json'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/**
 * Ate 2026-09-07 nenhuma pagina server usava next-intl, entao teste de Server
 * Component nao precisava disso. Com a copy das paginas migrada para o catalogo,
 * `getTranslations` passou a rodar dentro do jsdom — onde `next-intl/server`
 * resolve para o build de cliente e lanca "not supported in Client Components".
 *
 * O dublê usa o catalogo pt-BR REAL (mesma escolha do harness de render em
 * `src/test/utils.tsx`): teste que passa com mensagens falsas nao prova que a
 * chave existe no dicionario que chega ao usuario.
 */
type TranslatorArg = string | { locale?: string; namespace?: string } | undefined

/**
 * O `createTranslator` tipa `namespace` com a uniao literal das chaves do
 * catalogo importado. Aqui o valor so existe em runtime (vem de quem chamou
 * `getTranslations`), entao a uniao entra por assercao — errar a chave continua
 * falhando no teste, que e onde tem que doer.
 */
function namespaceOf(arg: TranslatorArg) {
  const ns = typeof arg === 'string' ? arg : arg?.namespace
  return ns as never
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (arg?: TranslatorArg) =>
    createTranslator({ locale: 'pt-BR', messages: ptBR, namespace: namespaceOf(arg) }),
  getLocale: async () => 'pt-BR',
  getMessages: async () => ptBR,
  getFormatter: async () => createFormatter({ locale: 'pt-BR' }),
  getTimeZone: async () => 'America/Sao_Paulo',
  getNow: async () => new Date(),
}))
