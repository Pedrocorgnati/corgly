import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Vitest config exclusivo para testes de integração.
 * Executa com banco de dados real — requer DATABASE_URL_TEST configurado.
 *
 * Uso:
 *   bun run test:integration
 *   DATABASE_URL_TEST=mysql://... bun run test:integration
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/integration/**/*.test.ts'],
    setupFiles: ['src/test/integration/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Execução sequencial — testes compartilham banco
      },
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['verbose'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
