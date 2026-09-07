import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // `vitest.env-setup.ts` PRECISA vir primeiro: ele popula process.env antes
    // de qualquer import que atravesse `src/lib/env.ts` (que lanca na ausencia).
    setupFiles: ['./vitest.env-setup.ts', './vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'prisma/',
        '.next/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
    exclude: [
      'node_modules',
      '.next',
      'playwright/**',
      'e2e/**',
      'src/test/integration/**',
      'src/__tests__/integration/rate-limit.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` lança fora de um React Server Component. Em produção (RSC)
      // ele resolve para um no-op via condição `react-server`; o vitest não seta
      // essa condição, então apontamos para o mesmo stub vazio para permitir o
      // unit test de route handlers / libs server-side.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
})
