import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: { include: ['tests/e2e/**/*.test.ts'], pool: 'forks',
    setupFiles: ['./tests/setup.ts'], testTimeout: 900_000, hookTimeout: 900_000 },
});
