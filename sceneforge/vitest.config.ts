import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    pool: 'forks',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60_000,
  },
});
