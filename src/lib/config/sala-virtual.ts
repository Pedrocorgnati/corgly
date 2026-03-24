import { z } from 'zod'

const salaVirtualEnvSchema = z.object({
  TURN_SERVER_SECRET: z.string().min(32, 'TURN_SERVER_SECRET deve ter ao menos 32 chars'),
  TURN_SERVER_URL: z.string().startsWith('turn:', 'TURN_SERVER_URL deve começar com turn:'),
  NEXT_PUBLIC_HOCUSPOCUS_URL: z
    .string()
    .refine(
      (v) => v.startsWith('wss://') || v.startsWith('ws://'),
      'NEXT_PUBLIC_HOCUSPOCUS_URL deve começar com wss:// ou ws://',
    ),
  HOCUSPOCUS_JWT_SECRET: z.string().min(32, 'HOCUSPOCUS_JWT_SECRET deve ter ao menos 32 chars'),
})

export type SalaVirtualConfig = z.infer<typeof salaVirtualEnvSchema>

let _config: SalaVirtualConfig | null = null

export function getSalaVirtualConfig(): SalaVirtualConfig {
  if (_config) return _config
  const result = salaVirtualEnvSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(
      `[sala-virtual] Configuração de ambiente inválida:\n${result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    )
  }
  _config = result.data
  return _config
}
