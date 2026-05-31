import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(__dirname, 'src/__tests__/setup.ts')],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    env: {
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
