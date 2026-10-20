import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Only Next's compiler can load Google fonts; tests get family names instead.
      'next/font/google': path.resolve(__dirname, './src/test/nextFontGoogle.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
