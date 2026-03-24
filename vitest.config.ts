import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
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
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
